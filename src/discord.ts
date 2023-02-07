import {
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    MessagePayload,
    Client,
    GatewayIntentBits,
    ButtonStyle, Channel, TextBasedChannel, Message
} from 'discord.js'
import {OfflineEvent, OnlineEvent} from "./twitch.js";


// Create a new client instance
const discordClient = new Client({ intents: [
    GatewayIntentBits.Guilds
]});

await discordClient.login(process.env.DISCORD_TOKEN ?? '')

type TwitchUserId = string;
type UserMessageReferenceMap = Map<TwitchUserId, MessageReference>;

interface MessageReference {
    message: Message,
    isOnline: boolean,
    lastChange: Number
}

export default class  {
    private userMessageReferences = new Map() as UserMessageReferenceMap

    constructor() {
        setInterval(this.cleanup.bind(this), 60000);
    }

    async online(twitchEvent: OnlineEvent) {

        // const row = new ActionRowBuilder()
        //     .addComponents(
        //         new ButtonBuilder()
        //             .setStyle(ButtonStyle.Link)
        //             .setLabel('watch now')
        //             .setURL(`https://twitch.tv/${twitchEvent.user.name}`)
        //     )

        let streamDescription = Array<String>()
        if (twitchEvent.stream.title) {
            streamDescription.push(twitchEvent.stream.title)
        }
        if (twitchEvent.stream.gameName) {
            streamDescription.push(twitchEvent.stream.gameName)
        }

        await this.message(
            twitchEvent.user.id,
            {
                embeds: [ await this.getEmbed(twitchEvent.user.displayName, true, streamDescription.join("\n"), twitchEvent.stream.startDate ?? new Date()) ],
                //components: [ row ]
            },
            true
        )
    }

    async offline(twitchEvent: OfflineEvent) {
        await this.message(
            twitchEvent.user.id,
            {
                embeds: [ await this.getEmbed(twitchEvent.user.displayName, false) ],
                //components: []
            },
            false
        )
    }

    async delete(twitchUserId: TwitchUserId) {
        const messageReference = this.userMessageReferences.get(twitchUserId)
        if (messageReference) {
            await messageReference.message.delete()
        }

        this.userMessageReferences.delete(twitchUserId)
    }

    /**
     * cleans up messages after 2 messages if they not have been reaped already by then
     * also cleans up all messages immediately if param is set to true (good for cleanup on bot shutdown etc.)
     */
    async cleanup(immediately: boolean = false) {
        for (const [twitchUserId, messageReference] of this.userMessageReferences) {
            if (immediately || messageReference.lastChange < (Date.now() - 172800000)) { //172800000 = 2 days
                await this.delete(twitchUserId)
            } else if (!messageReference.isOnline && messageReference.lastChange < (Date.now() - 21600000)) { //delete offline messages after 6 hours
                await this.delete(twitchUserId)
            }
        }
    }

    /**
     * Handles posting/updating the Discord Messages
     * if isOnline is true: the old message related to the twitchUserId gets deleted (if some already exists)
     * if isOnline is false: if an old message related to the twitchUserId exists it just gets updated
     */
    private async message(twitchUserId: TwitchUserId, messageOptions: any, isOnline: boolean = false) {
        const channel: Channel | undefined = discordClient.channels.cache.get(process.env.DISCORD_CHANNEL_ID ?? '');
        if (!channel) {
            console.log('channel', process.env.DISCORD_CHANNEL_ID, "could not be found")
            await this.cleanup(true);
            process.exit(1)
        }

        if (channel.isTextBased()) {
            if (isOnline) {
                await this.delete(twitchUserId) //delete any existing message
            }

            const messageReference = this.userMessageReferences.get(twitchUserId)
            if (messageReference) {
                await messageReference.message.edit(messageOptions)

                messageReference.isOnline = isOnline
                messageReference.lastChange = Date.now()
            } else {
                const message = await channel.send(messageOptions)

                this.userMessageReferences.set(twitchUserId, {
                    message,
                    isOnline,
                    lastChange: Date.now()
                })
            }
        } else {
            console.log('channel', process.env.DISCORD_CHANNEL_ID, "is not text based")
        }
    }

    private async getEmbed(twitchUserName: string, isOnline: boolean = false,  descriptionText: string = '', startDate?: Date) {
        const embedBuilder = new EmbedBuilder()
            .setTitle(twitchUserName)
            .setColor(isOnline ? Colors.Green : Colors.Red)
            .setFooter({text: isOnline ? 'started' : 'ended'})
            .setTimestamp(startDate ?? new Date())

        if (descriptionText.length > 0) {
            embedBuilder.setDescription(descriptionText)
        }

        embedBuilder.setURL(`https://twitch.tv/${twitchUserName.toLowerCase()}`)

        return embedBuilder
    }
}