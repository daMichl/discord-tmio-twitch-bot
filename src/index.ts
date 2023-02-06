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

//register twitch users and set the function to be also called in a 1-hour interval
registerTwitchUsers()
setInterval(registerTwitchUsers, 3600000); //every hour

function registerTwitchUsers(){
    trackmania.getTwitchUsersByClub(process.env.TRACKMANIA_CLUB_ID ?? '0').then(async twitchUserNames => {
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