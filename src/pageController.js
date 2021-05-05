const pageScraper = require('./pageScraper')

async function scrapeAll(browserInstance, string, mode) {
    let browser
    try {
        browser = await browserInstance       
        await pageScraper.scrape(browser, string, mode)
    } catch (error) {
        console.log('Couldn`t resolve the browser instance =>', error)
    }
}

module.exports = (browserInstance, string, mode) => scrapeAll(browserInstance, string, mode)