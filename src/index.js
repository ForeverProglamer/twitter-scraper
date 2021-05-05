const browser = require('./browser')
const scraperController = require('./pageController')
const config = require('../config/config')

let browserInstance = browser.createBrowser()
scraperController(browserInstance, config.stringToFind, config.mode1)