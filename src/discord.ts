import {ButtonStyle, Channel, Client, Colors, EmbedBuilder, GatewayIntentBits, Message} from 'discord.js'
import {OfflineEvent, OnlineEvent, UpdateEvent} from "./twitch.js";
import {HelixGame} from "@twurple/api";
import languageCodes from 'iso-639-1';


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
    lastChange: Number,
    startDate: Date
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



        await this.message(
            twitchEvent.user.id,
            {
                embeds: [ await this.getEmbed(twitchEvent.user.displayName, true, this.generateDescription(twitchEvent.stream.title, twitchEvent.stream.gameName, twitchEvent.stream.language), twitchEvent.stream.startDate ?? new Date()) ],
                //components: [ row ]
            },
            true,
            twitchEvent.stream.startDate
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
    async update(twitchEvent: UpdateEvent) {
        const messageReference = this.userMessageReferences.get(twitchEvent.broadcasterId)
        if (messageReference) {
            await this.message(
                twitchEvent.broadcasterId,
                {
                    embeds: [ await this.getEmbed(twitchEvent.broadcasterDisplayName, true, this.generateDescription(twitchEvent.streamTitle, await twitchEvent.getGame(), twitchEvent.streamLanguage), messageReference.startDate) ],
                    //components: [ row ]
                },
                true
            )
        }
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
    private async message(twitchUserId: TwitchUserId, messageOptions: any, isOnline: boolean = false, startDate?: Date) {
        const channel: Channel | undefined = discordClient.channels.cache.get(process.env.DISCORD_CHANNEL_ID ?? '');
        if (!channel) {
            console.log('channel', process.env.DISCORD_CHANNEL_ID, "could not be found")
            await this.cleanup(true);
            process.exit(1)
        }

        let wasOnlineBefore = false;
        const messageReference = this.userMessageReferences.get(twitchUserId)
        if (messageReference) {
            wasOnlineBefore = messageReference.isOnline;
        }

        if (channel.isTextBased()) {
            if (isOnline && !wasOnlineBefore) {
                await this.delete(twitchUserId) //delete any existing message
            }

            //just recheck if the referenced is available...
            // this.delete up there possibly deletes the object from memory.
            // after that messageReference could be undefined
            if (this.userMessageReferences.has(twitchUserId) && messageReference) {
                await messageReference.message.edit(messageOptions)

                messageReference.isOnline = isOnline
                messageReference.lastChange = Date.now()
            } else {
                const message = await channel.send(messageOptions)

                this.userMessageReferences.set(twitchUserId, {
                    message,
                    isOnline,
                    lastChange: Date.now(),
                    startDate: startDate ?? new Date()
                })
            }
        } else {
            console.log('channel', process.env.DISCORD_CHANNEL_ID, "is not text based")
        }
    }

    private async getEmbed(twitchUserName: string, isOnline: boolean = false,  descriptionText: string = '', startDate?: Date) {
        const embedBuilder = new EmbedBuilder()
            .setTitle(isOnline ? `${twitchUserName} is streaming` : `${twitchUserName} is offline`)
            .setColor(isOnline ? Colors.Green : Colors.Red)
            .setFooter({text: isOnline ? 'started' : 'ended'})
            .setTimestamp(startDate ?? new Date())

        if (descriptionText.length > 0) {
            embedBuilder.setDescription(descriptionText)
        }

        embedBuilder.setURL(`https://twitch.tv/${twitchUserName.toLowerCase()}`)

        return embedBuilder
    }

    private generateDescription(title: string | undefined | null, game: string | undefined | null | HelixGame, languageIsoCode: string | undefined | null): string {
        if (game instanceof HelixGame) {
            game = game.name;
        }

        let streamDescription = Array<String>()
        if (title) {
            streamDescription.push(`📣 ${title}`)
        }
        if (game) {
            streamDescription.push(`🕹️ ${game}`)
        }

        if (languageIsoCode) {
            let language = languageCodes.getName(languageIsoCode)
            if (language) {
                streamDescription.push(`🗣️ ${language}`)
            }
        }

        return '`' + streamDescription.join("`\n`") + '`'
    }
}