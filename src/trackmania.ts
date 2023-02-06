import axios from "axios";
import rateLimit from 'axios-rate-limit';
const tmio = rateLimit(axios.create({
    baseURL: 'https://trackmania.io/api/',
    timeout: 1000,
    headers: {'User-Agent': process.env.TRACKMANIA_IO_USER_AGENT ?? ''}
}), {
    maxRequests: 30, perMilliseconds: 60000
})

type TwitchUserNames = Array<string>

export default class Trackmania {
    async getTwitchUsersByClub(clubId: string) {
        const members = await this.getClubMembers(clubId);

        let twitchUsers = [] as TwitchUserNames;

        for (const member of members) {
            if (member.player.meta !== undefined && member.player.meta.twitch !== undefined) {
                twitchUsers.push(member.player.meta.twitch)
            }
        }

        return twitchUsers
    }

    async getClubMembers(clubId: string) : Promise<Array<any>> {
        return await this.fetchAll(`club/${clubId}/members`);
    }

    /**
     * Fetches and merges all pages of an endpoint + gives back only relevant data
     */
    private async fetchAll(endpoint: string) {
        let endpointFragments = endpoint.split('/')
        let relevantData = endpointFragments[endpointFragments.length -1]

        let actualPage = 0
        let maxPage = 0

        let cumulatedData: Array<any> = [];

        do {
            const response = await tmio.get(`${endpoint}/${actualPage}`)

            if (response.data.page_max === 0 || response.data[relevantData] === undefined) {
                break;
            }

            cumulatedData = cumulatedData.concat(response.data[relevantData])
            maxPage = response.data.page_max

            actualPage++;
        } while (actualPage < maxPage)

        return cumulatedData;
    }
}