// deno-lint-ignore-file
import { GatewayIntents } from "https://deno.land/x/harmony@v2.9.0/src/types/gateway.ts";
import { BOT_TOKEN, TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from "./configs.ts";
import { ActivityGame, ActivityTypes, ApplicationCommandInteraction, Client, ClientPresence, GuildChannel, Interaction, InteractionType, Message, StatusType } from "./deps.ts";
import { ChannelTypes } from "https://deno.land/x/harmony@v2.9.0/src/types/channel.ts";
import { createClient } from "npm:@libsql/client";
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { cron, } from "https://deno.land/x/deno_cron@v1.0.0/cron.ts";

const bot = new Client({
    enableSlash: true,
    intents: [
        GatewayIntents.GUILDS,
        GatewayIntents.GUILD_MESSAGES,
        GatewayIntents.MESSAGE_CONTENT,
        GatewayIntents.GUILD_INTEGRATIONS,
        GatewayIntents.GUILD_INTEGRATIONS
    ],
})

bot.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const command = interaction as ApplicationCommandInteraction;
        if (command.data.name === 'autopublish') {
            const subcommand = command.data.options[0] as any;
            const guiildId = command.guild?.id as string;
            if (subcommand.name === 'add') {
                const channel = subcommand?.options[0].value as string;
                const ch = await getChannel(channel)
                if (ch) {
                    await command.reply('Channel already in auto announce mode', { ephemeral: true })
                    return
                }
                const channelType = await command.guild?.channels.get(channel) as GuildChannel;
                if (channelType.type !== ChannelTypes.GUILD_NEWS) {
                    await command.reply('Channel must be a announcement channel', { ephemeral: true })
                    return
                }
                await updateChannel(guiildId, channel, true)
                await command.reply('Successfully added auto announce mode', { ephemeral: true })
            } else if (subcommand.name === 'remove') {
                const channel = subcommand.options[0].value as string;
                await updateChannel(guiildId, channel, false)
                await command.reply('Auto announce mode removed', { ephemeral: true })
            } else if (subcommand.name === 'list') {
                const result = await db.execute({
                    sql: `SELECT * FROM channels WHERE guild_id = ?`,
                    args: [guiildId]
                })
                if (result.rows.length === 0) {
                    await command.reply('No auto announce mode')
                } else {
                    const channels = result.rows.map((row) => `<#${row.id}>`).join('\n')
                    await command.reply(`Auto announce channels:\n${channels}`, { ephemeral: true })
                }
            } else if (subcommand.name === 'clear') {
                await db.execute({
                    sql: `DELETE FROM channels WHERE guild_id = ?`,
                    args: [guiildId]
                })
                await command.reply('Auto announce mode cleared', { ephemeral: true })
            } else if (subcommand.name === 'toggle') {
                const channel = subcommand.options[0].value as string;
                const mode = subcommand.options[1].value as boolean;
                const result = await db.execute({
                    sql: `SELECT * FROM channels WHERE guild_id = ? AND id = ?`,
                    args: [guiildId, channel]
                })
                if (result.rows[0]) {
                    await db.execute({
                        sql: `UPDATE channels SET mode = ? WHERE guild_id = ? AND id = ?`,
                        args: [mode, guiildId, channel]
                    })
                } else {
                    await db.execute({
                        sql: `INSERT INTO channels (id, mode, guild_id) VALUES (?, ?, ?)`,
                        args: [channel, mode, guiildId]
                    })
                }
                await command.reply(`Auto announce mode ${mode ? 'enabled' : 'disabled'}`, { ephemeral: true })
            }
        }
    }
})

bot.on('ready', async () => {
    console.log(`Logged in as ${bot.user?.tag}!`);
    const status = 'online' as StatusType;
    const activity = {
        type: ActivityTypes.PLAYING
    } as ActivityGame;

    const presence = new ClientPresence({
        status,
        activity
    });
    bot.setPresence(presence);
    const commands = await bot.interactions.commands.all()
    /* commands.forEach(async (command) => {
        await bot.interactions.commands.delete(command.id)
    }) */
    if (commands.size > 0) {
        await bot.interactions.commands.bulkEdit([
            {
                name: 'autopublish',
                description: 'Add, remove, list, clear, toggle auto crosspost mode',
                options: [
                    {
                        name: 'add',
                        description: 'Add auto crosspost mode',
                        type: 1,
                        options: [
                            {
                                name: 'channel',
                                description: 'Channel to add',
                                type: 7,
                                required: true,
                                channelTypes: [ChannelTypes.GUILD_NEWS]
                            }
                        ]
                    },
                    {
                        name: 'remove',
                        description: 'Remove auto crosspost mode',
                        type: 1,
                        options: [
                            {
                                name: 'channel',
                                description: 'Channel to remove',
                                type: 7,
                                required: true,
                                channelTypes: [ChannelTypes.GUILD_NEWS]
                            }
                        ]
                    },
                    {
                        name: 'list',
                        description: 'List auto crosspost mode',
                        type: 1
                    },
                    {
                        name: 'clear',
                        description: 'Clear all auto crosspost mode',
                        type: 1
                    },
                    {
                        name: "toggle",
                        description: "Toggle auto crosspost mode",
                        type: 1,
                        options: [
                            {
                                name: 'channel',
                                description: 'Channel to toggle',
                                type: 7,
                                required: true,
                                channelTypes: [ChannelTypes.GUILD_NEWS]
                            },
                            {
                                name: 'mode',
                                description: 'Mode to toggle',
                                type: 5,
                                required: true,
                                choices: [
                                    {
                                        name: 'enable',
                                        value: true
                                    },
                                    {
                                        name: 'disable',
                                        value: false
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
        ])
    }
})

bot.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return
    if (message.channel.type === ChannelTypes.GUILD_NEWS) {
        const channel = await getChannel(message.channel.id)
        if (!channel) return;
        if (!channel.mode) return;
        try {
            await bot.rest.post(`/channels/${message.channel.id}/messages/${message.id}/crosspost`);
        } catch (err) {
            console.log(err);
        }
    }
})

const db = createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN
})

db.batch([
    `CREATE TABLE IF NOT EXISTS guilds (
        id VARCHAR(255) PRIMARY KEY
    )`,
    `CREATE TABLE IF NOT EXISTS channels (
        id VARCHAR(255) PRIMARY KEY,
        mode BOOLEAN,
    guild_id VARCHAR(255) REFERENCES guilds(id)
    )`
])
async function getChannel(id: string) {
    const result = await db.execute({
        sql: `SELECT * FROM channels WHERE id = ?`,
        args: [id]
    })
    return result.rows[0]
}

async function updateChannel(guild_id: string, id: string, mode: boolean) {
    const guild = await db.execute({
        sql: `SELECT * FROM guilds WHERE id = ?`,
        args: [guild_id]
    })
    if (!guild.rows[0]) {
        await db.execute({
            sql: `INSERT INTO guilds (id) VALUES (?)`,
            args: [guild_id]
        })
    }
    const channel = await db.execute({
        sql: `SELECT * FROM channels WHERE id = ?`,
        args: [id]
    })
    if (channel.rows[0]) {
        await db.execute({
            sql: `UPDATE channels SET mode = ? WHERE mode = ? AND guild_id = ? AND id = ?`,
            args: [mode, guild_id, id]
        })
    } else {
        await db.execute({
            sql: `INSERT INTO channels (id, mode, guild_id) VALUES (?, ?, ?)`,
            args: [id, mode, guild_id]
        })
    }
}

if (!BOT_TOKEN) {
    const token = prompt('Input Bot Token:')
    if (token) {
        Deno.env.set('BOT_TOKEN', token)
    } else {
        console.error('Token is required')
        Deno.exit()
    }
}

bot.connect(BOT_TOKEN)

const handaleExit = () => {
    bot.destroy()
    console.log('Bot disconnected')
    Deno.exit()
}

Deno.addSignalListener('SIGINT', handaleExit)

// anti crash and keep alive

serve((_req) => {
    return new Response('Bot is alive');
})

cron('1 */1 * * * *', () => {
    fetch('https://turso-bot.deno.dev')
    console.log('Keep alive')
});