const config = require('../config/config')
const fs = require('fs')
const md5 = require('md5')
const {unionBy} = require('lodash')
const Promise = require('bluebird')

const scraperObject = {
    url: 'https://twitter.com/login',
    async scrape(browser, string, mode) {
        const startTime = new Date()
        let page = await browser.newPage()

        // Logging in
        await this.logIn(page)

        // Enter query string
        await page.waitForSelector('input[role="combobox"]')
        await page.type('input[role="combobox"]', string, {delay: config.typingDelay})
        await page.keyboard.press('Enter')

        let tweetsList = []
        let filename
        if (mode === 'accounts') {
            filename = config.accountsModeFileName
            
            // Scraping account urls
            console.log('Accounts scraping is started')

            const urls = await this.getAccounts(page, 100)

            console.log(urls)
            console.log(`Accounts scraped: ${urls.length}`)
            
            const testUrls = urls.slice(0, 50)

            // Scraping tweets
            tweetsList = await Promise.map(testUrls, async url => {
                let newPage = await browser.newPage()
                await newPage.goto(url, {waitUntil: 'networkidle2'})
                return await this.scrapeFeed(newPage, 100)
            }, {concurrency: config.concurrency})    

        } else if (mode === 'last') {
            // Scraping tweets from "Last"
            const data = await this.scrapeFeed(page, 300)
            tweetsList.push({'tweets': data, 'tweetsNumber': data.length})
            filename = config.lastModeFileName
        }
        
        console.log(tweetsList)
        console.log(`Total tweets scraped: ${tweetsList.length}`)

        fs.writeFile(filename, JSON.stringify(tweetsList, null, ' '), (err) => {
            if (err) console.log(err)
            console.log('Result have been written to file!')
        })

        await browser.close()
        console.log('Browser is closed')

        const endTime = new Date()
        console.log(`Start: ${startTime.getHours()}:${startTime.getMinutes()}:${startTime.getSeconds()}`)
        console.log(`End: ${endTime.getHours()}:${endTime.getMinutes()}:${endTime.getSeconds()}`)
        console.log(`Time elapsed: ${(endTime-startTime)/1000} sec.`)
    },
    async logIn(page) {
        console.log('Start logging in')

        // Going to login page
        await page.goto(this.url, {waitUntil: 'networkidle2'})

        // Pass the data into input fields and apply
        await page.type('input[name="session[username_or_email]"]', config.login, {delay: config.typingDelay})
        await page.type('input[name="session[password]"]', config.password, {delay: config.typingDelay})
        await page.click('div[role="button"]')

        await page.waitForTimeout(2000)
        console.log('End logging in')
    },
    async getAccounts(page, accountsNumber) {
        // Chose "People" section
        await page.waitForSelector('div[role="tablist"]')
        await page.click('div[role="presentation"]:nth-child(3) a')
        
        // Scraping
        const accounts = new Set()
        let steps = 0
        await page.waitForSelector('section div[data-testid="UserCell"]')
        let scrollHeight = await page.evaluate(() => window.pageYOffset)
        while (accounts.size <= accountsNumber) {
            // Getting current links
            const currentLinks = await page.$$eval('section div[data-testid="UserCell"]', divs => {
                let filteredDivs = [...divs].filter(div => div.querySelector('svg[aria-label="Protected account"]') === null)
                let links = filteredDivs.map(div => div.querySelector('a').href)
                return links
            })
            
            // Adding only new links
            for (const link of currentLinks.slice(steps >= 1 ? 20 : 0)) {
                accounts.add(link)
            }

            // Scrolling down
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
            await page.waitForTimeout(2000)
            const currentScrollHeight = await page.evaluate(() => window.pageYOffset)

            // If scrolling is over
            if (scrollHeight === currentScrollHeight) {
                break
            }

            scrollHeight = currentScrollHeight
            steps ++
        }

        return [...accounts]
    },
    async scrapeFeed(page, tweetsNumber) {
        let url = await page.url()
        console.log(`Start scraping from ${url}`)

        let totalTweets = []
        let scrollHeight = await page.evaluate(() => window.pageYOffset)
        outter: while (totalTweets.length <= tweetsNumber) {
            // Current tweets scraping
            let currentTweets = []
            const articles = await page.$$('section.css-1dbjc4n article')
            for (const article of articles) {
                try {
                    let tweet = {}

                    let text = await article.$$eval('div.r-bnwqim.r-qvutc0', divs => {
                        let object = {'text1': divs[0].textContent}
                        object['text2'] = divs.length > 1 ? divs[1].textContent : ''
                        return object
                    })

                    let time = await article.$$eval('time', time => {
                        let object = {'time1': time[0].dateTime}
                        object['time2'] = time.length > 1 ?  time[1].dateTime : ''
                        return object
                    })

                    let replies = await article.$eval('div[data-testid="reply"]', div => div.textContent || 0)
                    let retweets = await article.$eval('div[data-testid="retweet"]', div => div.textContent || 0)
                    let likes = await article.$eval('div[data-testid="like"]', div => div.textContent || 0)

                    tweet['text'] = text.text1
                    tweet['md5'] = md5(text.text1)
                    tweet['time'] = time.time1
                    tweet['replies'] = replies
                    tweet['retweets'] = retweets
                    tweet['likes'] = likes
                    tweet['originalTweet'] = {'text': text.text2, 'time': time.time2}

                    currentTweets.push(tweet)
                } catch (error) {
                    // console.log(error)
                    continue
                }
            }

            // Adding unique tweets to scraped once
            totalTweets = unionBy(totalTweets, currentTweets, 'md5')

            // Scrolling down
            let scrollingAttempt = 0
            while (true) {
                // Normal scrolling attempt
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
                await page.waitForTimeout(2000)
                const currentScrollHeight = await page.evaluate(() => window.pageYOffset)

                // Maybe this is the end of the page?
                if (scrollHeight === currentScrollHeight) {
                    // Trying to scroll up and down to load additionl content
                    await page.evaluate(() => window.scrollTo(0, -document.body.scrollHeight))
                    await page.waitForTimeout(2000)
                    scrollingAttempt++

                    // Seems to be the end of the page
                    if (scrollingAttempt >= 3) {
                        // End up with scraping on this page
                        console.log('End of the scroll')
                        break outter
                    }  
                }
                // Nope. Go on scraping
                else {
                    scrollHeight = currentScrollHeight
                    break
                }
            }
        }

        console.log(`${totalTweets.length} tweets scraped from ${url}`)
        
        await page.close()
        
        return {'url': url,'tweetsNumber': totalTweets.length, 'tweets': totalTweets}
    }
}

module.exports = scraperObject