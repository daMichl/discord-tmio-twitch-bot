# Discord trackmania.io twitch bot

Discord bot that announces twitch streams based on data from club members on trackmania.io

It creates new embed messages if a stream goes online, updates them on changes (title, game, language, offline) and cleans up the offline message after 8 hours. also self cleaning on shutdown. updates twitch accs from configured clubs at trackmania.io every hour.

**this app needs to be able to be called through http/https from the outside. it will register twitch webhooks. (see env WEBHOOK_HOSTNAME)**

for configuration info see .env.example

example discord messages:

![grafik](https://user-images.githubusercontent.com/4919213/221337001-7835e089-d6ee-4249-b6cd-c8046b8f0f58.png)

![grafik](https://user-images.githubusercontent.com/4919213/221338113-2a79b06c-7bf1-452e-8b47-2b5b0b19184d.png)

**Disclaimer:** I made this primarily for my own usage. You are free to use it as long you are stating changes. If you have any questions you probably can ask in the folling discord thread: https://discord.com/channels/276076890714800129/1095006446720143512 but keep in mind that I answer on my own time, so response could take a while.
