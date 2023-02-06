import {ClientCredentialsAuthProvider} from '@twurple/auth';
import {ApiClient, HelixStream, HelixUser} from '@twurple/api';
import Emittery from "emittery";
import {EventSubHttpListener, ReverseProxyAdapter} from "@twurple/eventsub-http";

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

export interface OfflineEvent extends UnsubscribedEvent {}

export interface OnlineEvent extends OfflineEvent{
    stream: HelixStream
}

export default class Twitch {

    public streamEvents = new Emittery<{
        online: OnlineEvent,
        offline: OfflineEvent,
        unsubscribed: UnsubscribedEvent
    }>();

    /**
     * use isInit = true for the first subscription process, this also sends events for already streaming users...
     */
    async subscribe(userNames: Array<string>, isInit: boolean = false) {
        const users = await apiClient.users.getUsersByNames(userNames)

        await this.updateStreamEventSubs(users);

        if (isInit) {
            for (const user of users) {
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

    private eventHandler(broadcaster: HelixUser, stream: HelixStream|null = null, unsubscribe: boolean = false) {
        if (!stream) {
            if (unsubscribe) {
                return this.streamEvents.emit('unsubscribed', {
                    date: new Date,
                    user: broadcaster
                })
            }

            return this.streamEvents.emit('offline', {
                date: new Date,
                user: broadcaster
            })

        }

        return this.streamEvents.emit('online', {
            date: stream.startDate,
            user: broadcaster,
            stream
        })
    }
}