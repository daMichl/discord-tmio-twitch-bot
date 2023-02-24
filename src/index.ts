import Discord from "./discord.js";
import Trackmania from "./trackmania.js";
import Twitch from "./twitch.js";

const discord = new Discord();
const trackmania = new Trackmania();
const twitch = new Twitch();

twitch.streamEvents.on('online', event => discord.online(event))
twitch.streamEvents.on('offline', event => discord.offline(event))

//deletes already posted discord event messages for members that where removed from the club
twitch.streamEvents.on('unsubscribed', event => discord.delete(event.user.id))

twitch.streamEvents.on('update', event => discord.update(event))

//register twitch users and set the function to be also called in a 1-hour interval
registerTwitchUsers()
setInterval(registerTwitchUsers, 3600000); //every hour

function registerTwitchUsers(){
    const clubIdEnvString = process.env.TRACKMANIA_CLUB_IDS ?? '0'
    const additionalTwitchAccountsEnvString = process.env.ADDITIONAL_TWITCH_ACCOUNTS ?? ''
    const additionalTwitchUserNames = additionalTwitchAccountsEnvString.split(',')
    trackmania.getTwitchUsersByClub(clubIdEnvString.split(',')).then(async twitchUserNames => {
        for (const additionalTwitchUserName of additionalTwitchUserNames) {
            let trimmedUsername = additionalTwitchUserName.trim()
            if (trimmedUsername.length > 0) {
                twitchUserNames.add(trimmedUsername)
            }
        }

        console.log('register/update twitchUsers', twitchUserNames)
        await twitch.subscribe(twitchUserNames, true)
    })
}

async function exitHandler() {
    console.log('SHUTTING DOWN>', 'delete all discord messages before shut down')
    await discord.cleanup(true)

    console.log('SHUTTING DOWN>', 'GOOD BYE')
    process.exit(0)
}

process.on('SIGINT', exitHandler)
process.on('SIGTERM', exitHandler)
process.on('SIGQUIT', exitHandler)