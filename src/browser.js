const puppeteer = require('puppeteer')
const {headless} = require('../config/config')

async function createBrowser() {
    let browser
    try {
        browser = await puppeteer.launch({
            headless: headless,
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            args: [`--window-size=${1920},${1080}`]
        })
        console.log('Browser instance created')
    } catch (error) {
        console.log('Can`t create browser instance =>', error)
    }
    return browser
}

module.exports = {createBrowser}