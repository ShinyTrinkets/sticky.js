const fs = require('fs')
const util = require('./util')
const functions = require('./functions')
const { Lexer } = require('./lexer')
const { parse } = require('./parser')
const { getText, unParse } = require('./tags')
const { isDoubleTag, isSingleTag } = require('./tags')
const { optRenderOnce, optShouldConsume } = require('./tags')

const readdirp = require('readdirp')
const { promisify } = require('util')
const writeFile = promisify(fs.writeFile)

async function flattenSingleTag(tag, data, allFunctions) {
    // Convert a single tag into raw text,
    // by evaluating the tag function
    const func = allFunctions[util.toCamelCase(tag.name)]
    const params = Object.assign({}, data, tag.params)
    const text = params.text ? params.text : ''
    let result = tag.rawText
    try {
        result = await func({ text }, params)
        delete tag.name
        delete tag.single
        tag.rawText = result.toString()
    } catch (err) {
        console.warn(`Cannot eval single tag "${tag.name}":`, err.message)
    }
}

async function flattenDoubleTag(tag, data, allFunctions) {
    /*
     * Deep evaluate all tags, by calling the tag function.
     * If the double tag has param consume=true, it will be destroyed
     * after render, just like a single tag.
     * If the double tag has param once=true, it will not be evaluated,
     * if it contains any text inside.
     */
    if (tag.children) {
        for (const c of tag.children) {
            if (isDoubleTag(c)) {
                await flattenDoubleTag(c, data, allFunctions)
            } else if (isSingleTag(c)) {
                await flattenSingleTag(c, data, allFunctions)
            }
        }
    }
    // At this point all children are flat
    const func = allFunctions[util.toCamelCase(tag.name)]
    const params = { ...data, ...tag.params }
    const text = getText(tag)
    if (text && optRenderOnce(tag)) {
        return
    }
    let result = text
    try {
        result = await func({ text }, params)
        if (optShouldConsume(tag)) {
            delete tag.name
            delete tag.double
            delete tag.params
            delete tag.children
            delete tag.firstTagText
            delete tag.secondTagText
            tag.rawText = result.toString()
        } else {
            tag.children = [{ rawText: result.toString() }]
        }
    } catch (err) {
        console.warn(`Cannot eval double tag "${tag.name}":`, err.message)
    }
}

async function renderText(text, data = {}, customFunctions = {}, customConfig = {}) {
    /**
     * TwoFold render text string.
     */
    const allFunctions = { ...functions, ...customFunctions }
    // const label = 'tf-' + (Math.random() * 100 * Math.random()).toFixed(6)
    // console.time(label)
    const ast = parse(new Lexer(customConfig).lex(text), customConfig)

    let final = ''
    // Convert single tags into raw text and deep flatten double tags
    for (const t of ast) {
        if (isDoubleTag(t)) {
            await flattenDoubleTag(t, data, allFunctions)
        } else if (isSingleTag(t)) {
            await flattenSingleTag(t, data, allFunctions)
        }
        final += unParse(t)
    }
    // console.timeEnd(label)
    return final
}

async function renderStream(stream, data = {}, customFunctions = {}, customConfig = {}) {
    const allFunctions = { ...functions, ...customFunctions }

    return new Promise(resolve => {
        // const label = 'tf-' + (Math.random() * 100 * Math.random()).toFixed(6)
        // console.time(label)
        const lex = new Lexer(customConfig)

        stream.on('data', text => {
            lex.push(text)
        })
        stream.on('close', async () => {
            const ast = parse(lex.finish(), customConfig)
            let final = ''

            // Convert single tags into raw text and deep flatten double tags
            for (const t of ast) {
                if (isDoubleTag(t)) {
                    await flattenDoubleTag(t, data, allFunctions)
                } else if (isSingleTag(t)) {
                    await flattenSingleTag(t, data, allFunctions)
                }
                final += unParse(t)
            }

            // console.timeEnd(label)
            resolve(final)
        })
    })
}

async function renderFile(fname, data = {}, customFunctions = {}, customConfig = {}) {
    const stream = fs.createReadStream(fname, { encoding: 'utf8' })
    const presult = await renderStream(stream, data, customFunctions, customConfig)
    if (customConfig.write) {
        await writeFile(fname, await presult, { encoding: 'utf8' })
        return true
    }
    return presult
}

async function renderFolder(dir, data = {}, customFunctions = {}, customConfig = {}) {
    for await (const pth of readdirp(dir, { fileFilter: ['*.*'], depth: 3 })) {
        const fname = `${dir}/${pth.path}`
        await renderFile(fname, data, customFunctions, customConfig)
    }
}

module.exports = { renderText, renderStream, renderFile, renderFolder }
