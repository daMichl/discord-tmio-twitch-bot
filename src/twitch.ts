import {ClientCredentialsAuthProvider} from '@twurple/auth';
import {ApiClient, HelixEventSubSubscription, HelixStream, HelixUser} from '@twurple/api';
import Emittery from "emittery";
import {EventSubHttpListener, ReverseProxyAdapter} from "@twurple/eventsub-http";
import {EventSubChannelUpdateEvent} from "@twurple/eventsub-base/lib/events/EventSubChannelUpdateEvent";
import {EventSubSubscription} from "@twurple/eventsub-base/lib/subscriptions/EventSubSubscription";
import {isSet} from "util/types";

const clientId = process.env.TWITCH_CLIENT_ID ?? '';
const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? '';

const authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
const apiClient = new ApiClient({ authProvider });

const listener = new EventSubHttpListener({
    apiClient,
    strictHostCheck: true,
    adapter: new ReverseProxyAdapter({
        hostName: process.env.WEBHOOK_HOSTNAME ?? '',
        port: 3000
    }),
    secret: process.env.WEBHOOK_SECRET ?? ''
});


await apiClient.eventSub.deleteAllSubscriptions()
await listener.start()

export interface UnsubscribedEvent {
    date: Date,
    user: HelixUser
}

type TwitchUserId = string

export interface OfflineEvent extends UnsubscribedEvent {}

export interface OnlineEvent extends OfflineEvent{
    stream: HelixStream
}

export interface UpdateEvent extends EventSubChannelUpdateEvent {}

export default class Twitch {
    public streamEvents = new Emittery<{
        online: OnlineEvent,
        offline: OfflineEvent,
        unsubscribed: UnsubscribedEvent
        update: UpdateEvent
    }>();

    private channelUpdateEventReferences = new Map<TwitchUserId, EventSubSubscription>()

    /**
     * use isInit = true for the first subscription process, this also sends events for already streaming users...
     */
    async subscribe(userNames: Array<string>|Set<string>, isInit: boolean = false) {
        if (isSet(userNames)) {
            userNames = [...userNames]
        }

        const users = await apiClient.users.getUsersByNames(userNames)

        await this.updateStreamEventSubs(users);

        if (isInit) {
            for (const user of users) {
                if (!this.isDevTest(user)) {
                    const stream = await user.getStream()
                    if (stream) {
                        console.log(`user already online>  ${user.displayName}> trigger online event`)

                        await this.eventHandler(
                            user,
                            stream
                        )
                    }
                }
            }
        }
    }

    private async updateStreamEventSubs(validUsers: Array<HelixUser>) {
        //clean out all deprecated subscriptions
        let subscriptions = await apiClient.eventSub.getSubscriptions()
        for (const subscription of subscriptions.data) {
            const subscriptionType = subscription.type
            const subscriptionUserId = (subscription.condition.broadcaster_user_id ?? '0') as string

            let isDeprecatedSubscription = true
            for (const validUser of validUsers) {
                if (validUser.id === subscriptionUserId) {
                    isDeprecatedSubscription = false
                    break
                }
            }

            if (isDeprecatedSubscription) {
                const user = await apiClient.users.getUserById(subscriptionUserId);
                if (user) {
                    await this.eventHandler(user, null, true)
                }

                await subscription.unsubscribe()

            }
        }

        //register new subscriptions if not already registered
        let subscriptionPromises = new Array<Promise<any>>()
        for (const validUser of validUsers) {
            let hasActiveOnlineSubscription = false;
            let hasActiveOfflineSubscription = false;

            for (const activeSubscription of subscriptions.data) {
                const activeSubscriptionType = activeSubscription.type
                const activeSubscriptionUserId = activeSubscription.condition.broadcaster_user_id ?? 0

                if (activeSubscriptionUserId === validUser.id) {
                    switch (activeSubscriptionType) {
                        case 'stream.online':
                            hasActiveOnlineSubscription = true
                            break

                        case 'stream.offline':
                            hasActiveOfflineSubscription = true
                            break
                    }
                }

                if (hasActiveOnlineSubscription && hasActiveOfflineSubscription) {
                    break //speed up the process if possible
                }
            }

            console.log("subscribe/resubscribe user events (online, offline)", validUser.displayName, !hasActiveOnlineSubscription, !hasActiveOfflineSubscription)

            if (!hasActiveOnlineSubscription) {
                subscriptionPromises.push(listener.subscribeToStreamOnlineEvents(validUser, async (onlineEvent) => {
                    await this.eventHandler(
                        await onlineEvent.getBroadcaster(),
                        await onlineEvent.getStream()
                    )
                }));
            }

            if (!hasActiveOfflineSubscription) {
                subscriptionPromises.push(listener.subscribeToStreamOfflineEvents(validUser, async (offlineEvent) => {
                    await this.eventHandler(
                        await offlineEvent.getBroadcaster()
                    );
                }));
            }
        }

        await Promise.all(subscriptionPromises)
    }

    private async manageUpdateEventSubscription(helixUser: HelixUser, unsubscribe: boolean = false) {
        const updateEventReference = this.channelUpdateEventReferences.get(helixUser.id)
        if (updateEventReference) {
            if (unsubscribe) {
                await updateEventReference.stop()
                this.channelUpdateEventReferences.delete(helixUser.id)
            }

            return;
        }

        this.channelUpdateEventReferences.set(
            helixUser.id,
            await listener.subscribeToChannelUpdateEvents(helixUser, async (updateEvent) => {
                await this.streamEvents.emit('update', updateEvent)
            })
        )
    }

    private async eventHandler(broadcaster: HelixUser, stream: HelixStream|null = null, unsubscribe: boolean = false) {
        if (!this.isDevTest(broadcaster)) {
            if (!stream) {
                if (unsubscribe) {
                    await this.manageUpdateEventSubscription(broadcaster, true)
                    return this.streamEvents.emit('unsubscribed', {
                        date: new Date,
                        user: broadcaster
                    })
                }

                await this.manageUpdateEventSubscription(broadcaster, true)
                return this.streamEvents.emit('offline', {
                    date: new Date,
                    user: broadcaster
                })

            }

            await this.streamEvents.emit('online', {
                date: stream.startDate,
                user: broadcaster,
                stream
            })
            return this.manageUpdateEventSubscription(broadcaster)
        }
    }

    private isDevTest(broadcaster: HelixUser) {
        return process.env.ENVIRONMENT === 'production' && broadcaster.description.includes('DevTest')
    }
}