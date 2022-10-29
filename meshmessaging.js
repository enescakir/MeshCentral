/**
* @description MeshCentral user messaging communication module
* @author Ylian Saint-Hilaire
* @copyright Intel Corporation 2022
* @license Apache-2.0
* @version v0.0.1
*/

/*xjslint node: true */
/*xjslint plusplus: true */
/*xjslint maxlen: 256 */
/*jshint node: true */
/*jshint strict: false */
/*jshint esversion: 6 */
"use strict";

/*
// For Telegram user login, add this in config.json
"messaging": {
  "telegram": {
    "apiid": 00000000,
    "apihash": "00000000000000000000000",
    "session": "aaaaaaaaaaaaaaaaaaaaaaa"
  }
}

// For Telegram bot login, add this in config.json
"messaging": {
  "telegram": {
    "apiid": 00000000,
    "apihash": "00000000000000000000000",
    "bottoken": "00000000:aaaaaaaaaaaaaaaaaaaaaaaa"
  }
}

// For Discord login, add this in config.json
"messaging": {
  "discord": {
    "inviteurl": "https://discord.gg/xxxxxxxxx",
    "token": "xxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxx"
  }
}

// For XMPP login, add this in config.json
{
  "messaging": {
    "xmpp": {
      "service": "xmppserver.com",
      "credentials": {
        "username": "username",
        "password": "password"
      }
    }
  }
}

// For CallMeBot
// For Signal Messenger: https://www.callmebot.com/blog/free-api-signal-send-messages/
{
  "messaging": {
    "callmebot": true
  }
}

*/

// Construct a messaging server object
module.exports.CreateServer = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.providers = 0; // 1 = Telegram, 2 = Signal, 4 = Discord, 8 = XMPP, 16 = CallMeBot
    obj.telegramClient = null;
    obj.discordClient = null;
    obj.discordUrl = null;
    obj.xmppClient = null;
    var xmppXml = null;
    obj.callMeBotClient = null;

    // Telegram client setup
    if (parent.config.messaging.telegram) {
        // Validate Telegram configuration values
        var telegramOK = true;
        if (typeof parent.config.messaging.telegram.apiid != 'number') { console.log('Invalid or missing Telegram apiid.'); telegramOK = false; }
        if (typeof parent.config.messaging.telegram.apihash != 'string') { console.log('Invalid or missing Telegram apihash.'); telegramOK = false; }
        if ((typeof parent.config.messaging.telegram.session != 'string') && (typeof parent.config.messaging.telegram.bottoken != 'string')) { console.log('Invalid or missing Telegram session or bottoken.'); telegramOK = false; }

        if (telegramOK) {
            // Setup Telegram
            async function setupTelegram() {
                const { TelegramClient } = require('telegram');
                const { StringSession } = require('telegram/sessions');
                const { Logger } = require('telegram/extensions/Logger');
                const logger = new Logger({ LogLevel : 'none' });
                const input = require('input');
                var client;
                if (parent.config.messaging.telegram.bottoken == null) {
                    // User login
                    var stringSession = new StringSession(parent.config.messaging.telegram.session);
                    const client = new TelegramClient(stringSession, parent.config.messaging.telegram.apiid, parent.config.messaging.telegram.apihash, { connectionRetries: 5, baseLogger: logger });
                    await client.start({ onError: function (err) { console.log('Telegram error', err); } });
                    obj.telegramClient = client;
                    obj.providers += 1; // Enable Telegram messaging
                    console.log("MeshCentral Telegram client is user connected.");
                } else {
                    // Bot login
                    var stringSession = new StringSession('');
                    const client = new TelegramClient(stringSession, parent.config.messaging.telegram.apiid, parent.config.messaging.telegram.apihash, { connectionRetries: 5, baseLogger: logger });
                    await client.start({ botAuthToken: parent.config.messaging.telegram.bottoken, onError: function (err) { console.log('Telegram error', err); } });
                    obj.telegramClient = client;
                    obj.providers += 1; // Enable Telegram messaging
                    console.log("MeshCentral Telegram client is bot connected.");
                }
            }
            setupTelegram();
        }
    }

    // Discord client setup
    if (parent.config.messaging.discord) {
        // Validate Discord configuration values
        var discordOK = true;
        if (typeof parent.config.messaging.discord.token != 'string') { console.log('Invalid or missing Discord token.'); discordOK = false; }

        if (discordOK) {
            // Setup Discord
            const { Client, GatewayIntentBits } = require('discord.js');
            var discordClient = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.DirectMessages
                ]
            });

            // Called when Discord client is connected
            discordClient.on('ready', function() {
                console.log(`MeshCentral Discord client is connected as ${discordClient.user.tag}!`);
                obj.discordClient = discordClient;
                obj.discordUrl = parent.config.messaging.discord.serverurl;
                obj.providers += 4; // Enable Discord messaging
            });

            // Receives incoming messages, ignore for now
            discordClient.on('messageCreate', function(message) {
                if (message.author.bot) return false;
                console.log(`Discord message from ${message.author.username}: ${message.content}`, message.channel.type);
                //message.channel.send("Channel Hello");
                //message.author.send('Private Hello');
            });

            // Called when Discord client received an interaction
            discordClient.on('interactionCreate', async function(interaction) {
                console.log('Discord interaction', interaction);
                if (!interaction.isChatInputCommand()) return;
                if (interaction.commandName === 'ping') { await interaction.reply('Pong!'); }
            });

            // Connect Discord client
            discordClient.login(parent.config.messaging.discord.token);
        }
    }

    // XMPP client setup
    if (parent.config.messaging.xmpp) {
        // Validate XMPP configuration values
        var xmppOK = true;
        if (typeof parent.config.messaging.xmpp.service != 'string') { console.log('Invalid or missing XMPP service.'); xmppOK = false; }

        if (xmppOK) {
            // Setup XMPP
            const { client, xml } = require('@xmpp/client');
            const xmpp = client(parent.config.messaging.xmpp);
            xmpp.on('error', function (err) { parent.debug('email', 'XMPP error: ' + err); console.error('XMPP error', err); });
            xmpp.on('offline', function () { parent.debug('email', 'XMPP client is offline.'); console.log('XMPP offline'); });
            //xmpp.on('stanza', async function (stanza) { if (stanza.is("message")) { await xmpp.send(xml('presence', { type: 'unavailable' })); await xmpp.stop(); } });
            xmpp.on('online', async function (address) {
                // await xmpp.send(xml("presence")); const message = xml("message", { type: "chat", to: "username@server.com" }, xml("body", {}, "hello world")); await xmpp.send(message);
                xmppXml = xml;
                obj.xmppClient = xmpp;
                obj.providers += 8; // Enable XMPP messaging
                console.log("MeshCentral XMPP client is connected.");
            });
            xmpp.start().catch(console.error);
        }
    }

    // CallMeBot client setup
    if (parent.config.messaging.callmebot) {
        obj.callMeBotClient = true;
        obj.providers += 16; // Enable CallMeBot messaging
    }

    // Send a direct message to a specific userid
    async function discordSendMsg(userId, message) {
        const user = await obj.discordClient.users.fetch(userId).catch(function () { return null; });
        if (!user) return;
        await user.send(message).catch(function (ex) { console.log('Discord Error', ex); });
    }

    // Convert a userTag to a userId. We need to query the Discord server to find this information.
    // Example: findUserByTab('aaaa#0000', function (userid) { sendMsg(userid, 'message'); });
    async function discordFindUserByTag(userTag, func) {
        var username = userTag.split('#')[0];
        const guilds = await obj.discordClient.guilds.fetch();
        guilds.forEach(async function (value, key) {
            var guild = await value.fetch();
            const guildMembers = await guild.members.search({ query: username });
            guildMembers.forEach(async function (value, key) {
                if ((value.user.username + '#' + value.user.discriminator) == userTag) { func(key); return; }
            });
        });
    }

    // Send an XMPP message
    async function sendXmppMessage(to, msg, func) {
        const message = xmppXml('message', { type: 'chat', to: to.substring(5) }, xmppXml('body', {}, msg));
        await obj.xmppClient.send(message);
        if (func != null) { func(true); }
    }

    // Send an user message
    obj.sendMessage = function(to, msg, func) {
        if ((to.startsWith('telegram:')) && (obj.telegramClient != null)) { // Telegram
            async function sendTelegramMessage(to, msg, func) {
                if (obj.telegramClient == null) return;
                parent.debug('email', 'Sending Telegram message to: ' + to.substring(9) + ': ' + msg);
                try { await obj.telegramClient.sendMessage(to.substring(9), { message: msg }); if (func != null) { func(true); } } catch (ex) { if (func != null) { func(false, ex); } }
            }
            sendTelegramMessage(to, msg, func);
        } else if ((to.startsWith('discord:')) && (obj.discordClient != null)) { // Discord
            discordFindUserByTag(to.substring(8), function (userid) {
                parent.debug('email', 'Sending Discord message to: ' + to.substring(9) + ', ' + userid + ': ' + msg);
                discordSendMsg(userid, msg); if (func != null) { func(true); }
            });
        } else if ((to.startsWith('xmpp:')) && (obj.xmppClient != null)) { // XMPP
            parent.debug('email', 'Sending XMPP message to: ' + to.substring(5) + ': ' + msg);
            sendXmppMessage(to, msg, func);
        } else if ((to.startsWith('callmebot:')) && (obj.callMeBotClient != null)) { // CallMeBot
            parent.debug('email', 'Sending CallMeBot message to: ' + to.substring(10) + ': ' + msg);
            console.log('Sending CallMeBot message to: ' + to.substring(10) + ': ' + msg);
            var toData = to.substring(10).split('|');
            if ((toData[0] == 'signal') && (toData.length == 3)) {
                var url = 'https://api.callmebot.com/signal/send.php?phone=' + encodeURIComponent(toData[1]) + '&apikey=' + encodeURIComponent(toData[2]) + '&text=' + encodeURIComponent(msg);
                require('https').get(url, function (r) { if (func != null) { func(r.statusCode == 200); } });
            } else if ((toData[0] == 'whatsapp') && (toData.length == 3)) {
                var url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(toData[1]) + '&apikey=' + encodeURIComponent(toData[2]) + '&text=' + encodeURIComponent(msg);
                require('https').get(url, function (r) { if (func != null) { func(r.statusCode == 200); } });
            } else if ((toData[0] == 'facebook') && (toData.length == 2)) {
                var url = 'https://api.callmebot.com/facebook/send.php?apikey=' + encodeURIComponent(toData[1]) + '&text=' + encodeURIComponent(msg);
                require('https').get(url, function (r) { if (func != null) { func(r.statusCode == 200); } });
            }
        } else {
            // No providers found
            func(false, "No messaging providers found for this message.");
        }
    }

    // Convert a CallMeBot URL into a handle
    obj.callmebotUrlToHandle = function (xurl) {
        var url = null;
        try { url = require('url').parse(xurl); } catch (ex) { return; }
        if ((url == null) || (url.host != 'api.callmebot.com') || (url.protocol != 'https:') || (url.query == null)) return;
        var urlArgs = {}, urlArgs2 = url.query.split('&');
        for (var i in urlArgs2) { var j = urlArgs2[i].indexOf('='); if (j > 0) { urlArgs[urlArgs2[i].substring(0, j)] = urlArgs2[i].substring(j + 1); } }
        if ((urlArgs['phone'] != null) && (urlArgs['phone'].indexOf('|') >= 0)) return;
        if ((urlArgs['apikey'] != null) && (urlArgs['apikey'].indexOf('|') >= 0)) return;
        // Signal Messenger, Whatapp and Facebook
        if (url.path.startsWith('/signal') && (urlArgs['phone'] != null) && (urlArgs['apikey'] != null)) { return 'callmebot:signal|' + urlArgs['phone'] + '|' + urlArgs['apikey']; }
        if (url.path.startsWith('/whatsapp') && (urlArgs['phone'] != null) && (urlArgs['apikey'] != null)) { return 'callmebot:whatsapp|' + urlArgs['phone'] + '|' + urlArgs['apikey']; }
        if (url.path.startsWith('/facebook') && (urlArgs['apikey'] != null)) { return 'callmebot:facebook|' + urlArgs['apikey']; }
        return null;
    }

    // Get the correct SMS template
    function getTemplate(templateNumber, domain, lang) {
        parent.debug('email', 'Getting SMS template #' + templateNumber + ', lang: ' + lang);
        if (Array.isArray(lang)) { lang = lang[0]; } // TODO: For now, we only use the first language given.

        var r = {}, emailsPath = null;
        if ((domain != null) && (domain.webemailspath != null)) { emailsPath = domain.webemailspath; }
        else if (obj.parent.webEmailsOverridePath != null) { emailsPath = obj.parent.webEmailsOverridePath; }
        else if (obj.parent.webEmailsPath != null) { emailsPath = obj.parent.webEmailsPath; }
        if ((emailsPath == null) || (obj.parent.fs.existsSync(emailsPath) == false)) { return null }

        // Get the non-english email if needed
        var txtfile = null;
        if ((lang != null) && (lang != 'en')) {
            var translationsPath = obj.parent.path.join(emailsPath, 'translations');
            var translationsPathTxt = obj.parent.path.join(emailsPath, 'translations', 'sms-messages_' + lang + '.txt');
            if (obj.parent.fs.existsSync(translationsPath) && obj.parent.fs.existsSync(translationsPathTxt)) {
                txtfile = obj.parent.fs.readFileSync(translationsPathTxt).toString();
            }
        }

        // Get the english email
        if (txtfile == null) {
            var pathTxt = obj.parent.path.join(emailsPath, 'sms-messages.txt');
            if (obj.parent.fs.existsSync(pathTxt)) {
                txtfile = obj.parent.fs.readFileSync(pathTxt).toString();
            }
        }

        // No email templates
        if (txtfile == null) { return null; }

        // Decode the TXT file
        var lines = txtfile.split('\r\n').join('\n').split('\n')
        if (lines.length <= templateNumber) return null;

        return lines[templateNumber];
    }

    // Send messaging account verification
    obj.sendMessagingCheck = function (domain, to, verificationCode, language, func) {
        parent.debug('email', "Sending verification message to " + to);

        var sms = getTemplate(0, domain, language);
        if (sms == null) { parent.debug('email', "Error: Failed to get SMS template"); return; } // No SMS template found

        // Setup the template
        sms = sms.split('[[0]]').join(domain.title ? domain.title : 'MeshCentral');
        sms = sms.split('[[1]]').join(verificationCode);

        // Send the message
        obj.sendMessage(to, sms, func);
    };

    // Send 2FA verification
    obj.sendToken = function (domain, to, verificationCode, language, func) {
        parent.debug('email', "Sending login token message to " + to);

        var sms = getTemplate(1, domain, language);
        if (sms == null) { parent.debug('email', "Error: Failed to get SMS template"); return; } // No SMS template found

        // Setup the template
        sms = sms.split('[[0]]').join(domain.title ? domain.title : 'MeshCentral');
        sms = sms.split('[[1]]').join(verificationCode);

        // Send the message
        obj.sendMessage(to, sms, func);
    };

    return obj;
};

// Called to setup the Telegram session key
module.exports.SetupTelegram = async function (parent) {
    // If basic telegram values are not setup, instruct the user on how to get them.
    if ((typeof parent.config.messaging != 'object') || (typeof parent.config.messaging.telegram != 'object') || (typeof parent.config.messaging.telegram.apiid != 'number') || (typeof parent.config.messaging.telegram.apihash != 'string')) {
        console.log('Login to your Telegram account at this URL: https://my.telegram.org/.');
        console.log('Click "API development tools" and fill your application details (only app title and short name required).');
        console.log('Click "Create application"');
        console.log('Set this apiid and apihash values in the messaging section of the config.json like this:');
        console.log('{');
        console.log('  "messaging": {');
        console.log('    "telegram": {');
        console.log('      "apiid": 123456,');
        console.log('      "apihash": "123456abcdfg"');
        console.log('    }');
        console.log('  }');
        console.log('}');
        console.log('Then, run --setuptelegram again to continue.');
        process.exit();
        return;
    }

    // If the session value is missing, perform the process to get it
    if (((parent.config.messaging.telegram.session == null) || (parent.config.messaging.telegram.session == '') || (typeof parent.config.messaging.telegram.session != 'string')) && ((parent.config.messaging.telegram.bottoken == null) || (parent.config.messaging.telegram.bottoken == '') || (typeof parent.config.messaging.telegram.bottoken != 'string'))) {
        if (parent.args.setuptelegram == 'user') {
            const { TelegramClient } = require('telegram');
            const { StringSession } = require('telegram/sessions');
            const { Logger } = require('telegram/extensions/Logger');
            const logger = new Logger({ LogLevel: 'none' });
            const input = require('input');
            const stringSession = new StringSession('');
            const client = new TelegramClient(stringSession, parent.config.messaging.telegram.apiid, parent.config.messaging.telegram.apihash, { connectionRetries: 5, baseLogger: logger });
            await client.start({
                phoneNumber: async function () { return await input.text("Please enter your number (+1-111-222-3333): "); },
                password: async function () { return await input.text("Please enter your password: "); },
                phoneCode: async function () { return await input.text("Please enter the code you received: "); },
                onError: function (err) { console.log('Telegram error', err); }
            });
            console.log('Set this session value in the messaging section of the config.json like this:');
            console.log('{');
            console.log('  "messaging": {');
            console.log('    "telegram": {');
            console.log('      "apiid": ' + parent.config.messaging.telegram.apiid + ',');
            console.log('      "apihash": "' + parent.config.messaging.telegram.apihash + '",');
            console.log('      "session": "' + client.session.save() + '"');
            console.log('    }');
            console.log('  }');
            console.log('}');
            process.exit();
        } else if (parent.args.setuptelegram == 'bot') {
            console.log('Login to your Telegram account, search for "BotFather", message him and create a bot.');
            console.log('Once you get the HTTP API token, add it in the config.json as "bottoken" like so:');
            console.log('{');
            console.log('  "messaging": {');
            console.log('    "telegram": {');
            console.log('      "apiid": ' + parent.config.messaging.telegram.apiid + ',');
            console.log('      "apihash": "' + parent.config.messaging.telegram.apihash + '",');
            console.log('      "bottoken": "00000000:aaaaaaaaaaaaaaaaaaaaaaaa"');
            console.log('    }');
            console.log('  }');
            console.log('}');
            process.exit();
        } else {
            console.log('run "--setuptelegram bot" to setup Telegram login as a bot (typical).');
            console.log('run "--setuptelegram user" to setup Telegram login as a user.');
            process.exit();
        }
    }

    // All Telegram values seem ok
    console.log('Telegram seems to be configured correctly in the config.json, no need to run --setuptelegram.');
    process.exit();
};
