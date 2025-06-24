// function/pesan.js
const fs = require('fs').promises; // Untuk operasi file asynchronous
const path = require('path'); // Untuk menangani path file
const { WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto } = require("@whiskeysockets/baileys"); // Untuk pesan menghilang, generateWAMessageFromContent dan proto
const config = require('../config'); // Import konfigurasi


async function handlePesan(sock, m, userDatabase, saveUserDatabase, currentMode) {
    const jid = m.key.remoteJid; // Pengirim pesan
    const isGroup = jid.endsWith('@g.us');
    const sender = m.key.fromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : (isGroup ? m.key.participant : jid);
    let textMessage = '';

    // Prioritize direct text messages and captions
    if (m.message?.conversation) {
        textMessage = m.message.conversation;
    } else if (m.message?.extendedTextMessage?.text) {
        textMessage = m.message.extendedTextMessage.text;
    } else if (m.message?.imageMessage?.caption) {
        textMessage = m.message.imageMessage.caption;
    } else if (m.message?.videoMessage?.caption) {
        textMessage = m.message.videoMessage.caption;
    } else if (m.message?.documentMessage?.caption) {
        textMessage = m.message.documentMessage.caption;
    }
    // Handle button messages
    else if (m.message?.buttonsMessage?.contentText) {
        textMessage = m.message.buttonsMessage.contentText;
    } else if (m.message?.buttonsResponseMessage?.selectedButtonId) {
        // For responses to button messages
        textMessage = m.message.buttonsResponseMessage.selectedDisplayText || m.message.buttonsResponseMessage.selectedButtonId;
    }
    // Handle list messages
    else if (m.message?.listMessage?.description) {
        textMessage = m.message.listMessage.description;
    } else if (m.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        // For responses to list messages
        textMessage = m.message.listResponseMessage.singleSelectReply.title || m.message.listResponseMessage.singleSelectReply.selectedRowId;
    }
    // Handle interactive/flow messages (this can be highly complex and depends on the specific flow)
    // This is a basic attempt to capture some text from interactive messages.
    else if (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            if (params.id) { // Often flow messages have an 'id' which can be a command
                textMessage = params.id;
            } else if (params.text) { // Or a 'text' field
                textMessage = params.text;
            }
            // You might need to parse 'body' or other parts for more detailed text
        } catch (e) {
            console.error("Error parsing interactive message paramsJson:", e);
        }
    }
    else if (m.message?.templateButtonReplyMessage?.selectedId) {
        textMessage = m.message.templateButtonReplyMessage.selectedDisplayText || m.message.templateButtonReplyMessage.selectedId;
    }
    else if (m.message?.reactionMessage?.text) {
        textMessage = m.message.reactionMessage.text; // Captures the emoji of a reaction
    }
    // Logika penanganan prefix
    let actualCommand = '';
    let actualArgs = '';
    let usedPrefix = '';

    let isCommand = false;

    if (config.PREFIX_ENABLED) {
        // Jika prefix diaktifkan, cari prefix yang cocok
        for (const p of config.PREFIXES) {
            if (textMessage.toLowerCase().startsWith(p.toLowerCase())) {
                usedPrefix = p;
                const fullCommand = textMessage.slice(p.length).trim();
                actualCommand = fullCommand.split(' ')[0].toLowerCase();
                actualArgs = fullCommand.split(' ').slice(1).join(' ');
                isCommand = true;
                break;
            }
        }
    } else {
        // Jika prefix tidak diaktifkan, setiap pesan dianggap sebagai perintah
        actualCommand = textMessage.toLowerCase().trim().split(' ')[0];
        actualArgs = textMessage.trim().split(' ').slice(1).join(' ');
        isCommand = true; // Selalu true jika prefix tidak wajib
    }

    // Jika pesan bukan merupakan perintah (misalnya, jika PREFIX_ENABLED true tapi tidak ada prefix yang cocok)
    if (!isCommand) {
        console.log(`[Bukan Perintah] Mengabaikan pesan: "${textMessage}"`);
        return; // Hentikan pemrosesan jika bukan perintah
    }

    // Inisialisasi user jika belum ada di database
    if (!userDatabase[sender]) {
        userDatabase[sender] = {
            name: m.pushName || 'Anonim',
            lastActivity: Date.now(),
            count: 0
        };
        await saveUserDatabase(userDatabase); // Simpan perubahan ke database
    }

    // Update last activity dan count
    userDatabase[sender].lastActivity = Date.now();
    userDatabase[sender].count++;
    await saveUserDatabase(userDatabase); // Simpan perubahan ke database


    console.log(`[Perintah Masuk] Dari: ${sender}, Perintah: "${usedPrefix}${actualCommand}", Argumen: "${actualArgs}"`);

    try {
        switch (actualCommand) {
            case 'menu':
                const modeText = currentMode === 'self' ? 'Pribadi (hanya DM)' : 'Publik (DM & Grup)';
            
                const menuText = `
╔══════════════════════════════╗
║          🤖 BOT MENU          ║
╚══════════════════════════════╝
👤 Nama: ${userDatabase[sender].name}
⚙️  Mode: ${modeText}
📩 Jumlah Pesan: ${userDatabase[sender].count}

╭───[ 📜 PERINTAH UMUM ]───────
│ hallo
│ info
│ profile
│ stats
╰─────────────────────────────

╭───[ 📩 PESAN ]────────────────
│ sendtext <teks>
│ sendquoted
│ mentionme
│ sendlink
│ sendimage
│ sendvideo
│ sendaudio
│ sendgif
│ sendviewonce
│ location
│ contact
│ buttons
│ buttonsflow
│ interactive
│ reaction
│ poll
│ pinmessage
│ unpinmessage
╰─────────────────────────────

╭───[ 🛠 MODIFIKASI CHAT ]──────
│ deletelast
│ editlast <teks>
│ archivechat
│ mutechat
│ unmutechat
│ markunread
│ deletechat
│ pinchat
│ unpinchat
│ starmessage
│ unstarmessage
│ ephemeral
╰─────────────────────────────

╭───[ 👤 PENGGUNA & GRUP ]─────
│ checkwa <nomor>
│ fetchstatus
│ fetchpp
│ fetchbizprofile
│ groupinfo
│ getinvitecode
│ revokeinvitecode
│ mygroups
│ getjoinrequests
╰─────────────────────────────

╭───[ ✏ UBAH PROFIL ]──────────
│ changestatus <status>
│ changename <nama>
│ changemypp <URL>
│ removemypp
╰─────────────────────────────

╭───[ 👑 ADMIN GRUP ]──────────
│ creategroup <nama>
│ addparticipant <nomor>
│ removeparticipant <nomor>
│ promoteparticipant <nomor>
│ demoteparticipant <nomor>
│ changegroupname <nama>
│ changegroupdesc <deskripsi>
│ groupsetting <option>
│ leavegroup
│ togglegroupephemeral
│ changegroupaddmode <mode>
╰─────────────────────────────

╭───[ 🔒 PRIVASI ]─────────────
│ blockuser
│ unblockuser
│ myprivacysettings
│ myblocklist
│ setlastseen <option>
│ setonlineprivacy <option>
│ setppprivacy <option>
│ setstatusprivacy <option>
│ setreadreceipts <option>
│ setgroupaddprivacy <option>
│ setdefaultephemeral <detik>
╰─────────────────────────────
    `.trim();
            
                await sock.sendMessage(jid, { text: menuText });
                break;
            
            case 'hallo':
                await sock.sendMessage(jid, { text: `Halo juga, ${userDatabase[sender].name}!` });
                break;

            case 'info':
                await sock.sendMessage(jid, { text: 'Ini adalah bot WhatsApp sederhana yang dibuat dengan Baileys.' });
                break;

            case 'sendtext':
                if (actualArgs) {
                    await sock.sendMessage(jid, { text: actualArgs });
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}sendtext <pesan Anda>\`` });
                }
                break;

            case 'sendquoted':
                if (m.key) {
                    await sock.sendMessage(jid, { text: 'Ini adalah pesan yang mengutip pesan Anda!' }, { quoted: m });
                } else {
                    await sock.sendMessage(jid, { text: 'Tidak dapat mengutip pesan ini.' });
                }
                break;

            case 'mentionme':
                await sock.sendMessage(jid, {
                    text: `Halo @${sender.split('@')[0]}!`,
                    mentions: [sender]
                });
                break;

            case 'sendlink':
                await sock.sendMessage(jid, {
                    text: 'Kunjungi Baileys di GitHub: https://github.com/whiskeysockets/baileys'
                });
                break;

            case 'sendimage':
                await sock.sendMessage(jid, {
                    image: { url: 'https://placehold.co/600x400/000000/FFFFFF/png?text=Placeholder+Image' },
                    caption: 'Ini adalah gambar placeholder.'
                });
                break;

            case 'sendvideo':
                await sock.sendMessage(jid, {
                    video: { url: 'https://www.w3schools.com/html/mov_bbb.mp4' }, // Contoh URL video publik
                    caption: 'Ini adalah video placeholder.',
                    gifPlayback: false
                });
                break;

            case 'sendaudio':
                await sock.sendMessage(jid, {
                    audio: { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }, // Contoh URL audio publik
                    mimetype: 'audio/mp4' // Atau 'audio/mpeg' jika itu mp3
                });
                break;

            case 'sendgif':
                await sock.sendMessage(jid, {
                    video: { url: 'https://i.giphy.com/media/v1.gif/media/l4FGp6wYt8g41oGvS/giphy.gif' }, // Contoh URL GIF (dianggap sebagai video)
                    caption: 'Ini adalah GIF placeholder.',
                    gifPlayback: true
                });
                break;

            case 'sendviewonce':
                await sock.sendMessage(jid, {
                    image: { url: 'https://placehold.co/400x300/FF0000/FFFFFF/png?text=View+Once' },
                    viewOnce: true,
                    caption: 'Gambar ini hanya bisa dilihat sekali!'
                });
                break;

            case 'location':
                await sock.sendMessage(jid, {
                    location: {
                        degreesLatitude: -6.2088, // Contoh koordinat Jakarta
                        degreesLongitude: 106.8456
                    }
                });
                break;

            case 'contact':
                const vcard = 'BEGIN:VCARD\n'
                    + 'VERSION:3.0\n'
                    + 'FN:Bot Whatsapp\n'
                    + 'ORG:My Company;\n'
                    + 'TEL;type=CELL;type=VOICE;waid=6282220132841:+62 822-2013-2841\n'
                    + 'END:VCARD';
                await sock.sendMessage(jid, {
                    contacts: {
                        displayName: 'Bot Whatsapp',
                        contacts: [{ vcard }]
                    }
                });
                break;

            case 'buttons':
                const buttons = [
                    { buttonId: 'id1', buttonText: { displayText: 'Tombol 1' }, type: 1 },
                    { buttonId: 'id2', buttonText: { displayText: 'Tombol 2' }, type: 1 },
                    { buttonId: 'id3', buttonText: { displayText: 'Tombol 3' }, type: 1 }
                ];
                const buttonMessage = {
                    text: "Pilih salah satu tombol di bawah ini:",
                    footer: 'Baileys Bot Example',
                    buttons: buttons,
                    headerType: 1
                };
                await sock.sendMessage(jid, buttonMessage);
                break;

            case 'buttonsflow':
                // Implementasi untuk Buttons Flow
                const flow = {
                    "name": "single_select",
                    "paramsJson": `{\"title\":\"Selection\",\"sections\":[{\"title\":\"Here Is title\",\"highlight_label\":\"meta native flow\",\"rows\":[{\"header\":\"header\",\"title\":\"title\",\"description\":\"description\",\"id\":\"id\"},{\"header\":\"header\",\"title\":\"title\",\"description\":\"description\",\"id\":\"id\"}]}]}`
                };
                const buttonsFlow = [
                    { buttonId: 'id1', buttonText: { displayText: 'Tombol Flow 1' }, type: 1 },
                    { buttonId: 'id2', buttonText: { displayText: 'Tombol Flow 2' }, type: 1 },
                    { buttonId: 'template', buttonText: { displayText: 'Template Flow' }, nativeFlowInfo: flow, type: 2 }
                ];
                const buttonFlowMessage = {
                    text: "Ini adalah pesan alur tombol (buttons flow)",
                    footer: 'Baileys Flow Example',
                    buttons: buttonsFlow,
                    headerType: 1
                };
                await sock.sendMessage(jid, buttonFlowMessage);
                break;

            case 'interactive':
                // Implementasi untuk Interactive Message
                const interactiveButton = [{
                    "name": "single_select",
                    "buttonParamsJson": `{\"title\":\"Pilihan Interaktif\",\"sections\":[{\"title\":\"Bagian 1\",\"highlight_label\":\"Pilih Opsi\",\"rows\":[{\"header\":\"Opsi 1\",\"title\":\"Detail Opsi 1\",\"description\":\"Deskripsi Opsi 1\",\"id\":\"opt1\"},{\"header\":\"Opsi 2\",\"title\":\"Detail Opsi 2\",\"description\":\"Deskripsi Opsi 2\",\"id\":\"opt2\"}]}]}`
                },{
                    "name": "quick_reply",
                    "buttonParamsJson": `{\"display_text\":\"Balas Cepat\",\"id\":\"quick_reply_id\"}`
                },{
                    "name": "cta_url",
                    "buttonParamsJson": `{\"display_text\":\"Kunjungi Google\",\"url\":\"https://www.google.com\",\"merchant_url\":\"https://www.google.com\"}`
                },{
                    "name": "cta_call",
                    "buttonParamsJson": `{\"display_text\":\"Hubungi Kami\",\"id\":\"call_action\"}`
                },{
                    "name": "cta_copy",
                    "buttonParamsJson": `{\"display_text\":\"Salin Kode\",\"id\":\"copy_action\",\"copy_code\":\"XYZ789\"}`
                }];

                let interactiveMsg = generateWAMessageFromContent(jid, {
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: {
                            text: "Ini adalah pesan interaktif."
                        },
                        footer: {
                            text: "WhatsApp API Example"
                        },
                        header: {
                            title: "Pesan Interaktif Bot",
                            hasMediaAttachment: false
                        },
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: interactiveButton,
                        })
                    })
                }, {
                    quoted: m // Mengutip pesan yang masuk
                });
                await sock.relayMessage(interactiveMsg.key.remoteJid, interactiveMsg.message, {
                    messageId: interactiveMsg.key.id
                });
                break;

            case 'reaction':
                if (m.key) {
                    await sock.sendMessage(jid, {
                        react: {
                            text: '👍',
                            key: m.key
                        }
                    });
                } else {
                    await sock.sendMessage(jid, { text: 'Tidak dapat memberikan reaksi pada pesan ini.' });
                }
                break;

            case 'poll':
                await sock.sendMessage(jid, {
                    poll: {
                        name: 'Polling Sederhana',
                        values: ['Opsi A', 'Opsi B', 'Opsi C'],
                        selectableCount: 1,
                        toAnnouncementGroup: false
                    }
                });
                break;

            case 'pinmessage':
            case 'unpinmessage':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                if (!m.key) {
                    await sock.sendMessage(jid, { text: 'Tidak ada pesan untuk dipin/unpin.' });
                    break;
                }
                try {
                    const type = (actualCommand === 'pinmessage') ? 1 : 0; // 1 untuk pin, 0 untuk unpin
                    // Durasi pin: 86400 detik = 24 jam
                    await sock.sendMessage(jid, {
                        pin: {
                            type: type,
                            time: type === 1 ? 86400 : 0, // 0 untuk unpin secara efektif
                            key: m.key // Pin pesan yang baru saja diterima
                        }
                    });
                    await sock.sendMessage(jid, { text: `Pesan ${actualCommand === 'pinmessage' ? 'dipin' : 'unpin'} berhasil (memerlukan izin admin grup).` });
                } catch (error) {
                    console.error('Error pinning/unpinning message:', error);
                    await sock.sendMessage(jid, { text: 'Gagal melakukan pin/unpin pesan. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'deletelast':
                if (m.key) {
                    await sock.sendMessage(jid, { delete: m.key }); // Hapus pesan yang baru saja diterima (untuk diri sendiri)
                    await sock.sendMessage(jid, { text: 'Pesan Anda telah dihapus (hanya untuk Anda).' });
                } else {
                    await sock.sendMessage(jid, { text: 'Tidak ada pesan untuk dihapus.' });
                }
                break;

            case 'editlast':
                if (m.message?.extendedTextMessage?.contextInfo?.stanzaId && actualArgs) {
                    const msgKeyToEdit = {
                        id: m.message.extendedTextMessage.contextInfo.stanzaId,
                        remoteJid: jid,
                        fromMe: m.message.extendedTextMessage.contextInfo.participant === sock.user.id.split(':')[0] + '@s.whatsapp.net' // Cek apakah pesan dari bot sendiri
                    };
                    await sock.sendMessage(jid, {
                        text: actualArgs,
                        edit: msgKeyToEdit,
                    });
                    await sock.sendMessage(jid, { text: 'Pesan berhasil diedit.' });
                } else {
                    await sock.sendMessage(jid, { text: `Balas pesan yang ingin diedit dengan \`${usedPrefix}editlast <teks baru>\`.` });
                }
                break;

            case 'archivechat':
                try {
                    // Mendapatkan pesan terakhir di chat (contoh sederhana: menggunakan pesan yang diterima)
                    const lastMsgInChat = m;
                    if (lastMsgInChat) {
                        await sock.chatModify({ archive: true, lastMessages: [{ key: lastMsgInChat.key, messageTimestamp: lastMsgInChat.messageTimestamp }] }, jid);
                        await sock.sendMessage(jid, { text: 'Chat ini telah diarsipkan.' });
                    } else {
                        await sock.sendMessage(jid, { text: 'Tidak ada pesan untuk mengarsipkan chat.' });
                    }
                } catch (error) {
                    console.error('Error archiving chat:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengarsipkan chat.' });
                }
                break;

            case 'mutechat':
                await sock.chatModify({ mute: 8 * 60 * 60 * 1000 }, jid); // Bisukan 8 jam
                await sock.sendMessage(jid, { text: 'Chat ini dibisukan selama 8 jam.' });
                break;

            case 'unmutechat':
                await sock.chatModify({ mute: null }, jid); // Batalkan bisu
                await sock.sendMessage(jid, { text: 'Chat ini telah dibatalkan bisunya.' });
                break;

            case 'markunread':
                try {
                    const lastMsgInChat = m;
                    if (lastMsgInChat) {
                        await sock.chatModify({ markRead: false, lastMessages: [{ key: lastMsgInChat.key, messageTimestamp: lastMsgInChat.messageTimestamp }] }, jid);
                        await sock.sendMessage(jid, { text: 'Chat ini telah ditandai belum dibaca.' });
                    } else {
                        await sock.sendMessage(jid, { text: 'Tidak ada pesan untuk menandai chat belum dibaca.' });
                    }
                } catch (error) {
                    console.error('Error marking chat unread:', error);
                    await sock.sendMessage(jid, { text: 'Gagal menandai chat belum dibaca.' });
                }
                break;

            case 'deletechat':
                try {
                    const lastMsgInChat = m;
                    if (lastMsgInChat) {
                        await sock.chatModify({
                            delete: true,
                            lastMessages: [
                                {
                                    key: lastMsgInChat.key,
                                    messageTimestamp: lastMsgInChat.messageTimestamp
                                }
                            ]
                        }, jid);
                        await sock.sendMessage(jid, { text: 'Chat ini telah dihapus (hanya untuk Anda).' });
                    } else {
                        await sock.sendMessage(jid, { text: 'Tidak ada pesan untuk menghapus chat.' });
                    }
                } catch (error) {
                    console.error('Error deleting chat:', error);
                    await sock.sendMessage(jid, { text: 'Gagal menghapus chat.' });
                }
                break;

            case 'pinchat':
                await sock.chatModify({ pin: true }, jid);
                await sock.sendMessage(jid, { text: 'Chat ini telah dipin.' });
                break;

            case 'unpinchat':
                await sock.chatModify({ pin: false }, jid);
                await sock.sendMessage(jid, { text: 'Chat ini telah dilepas pinnya.' });
                break;

            case 'starmessage':
            case 'unstarmessage':
                if (!m.key) {
                    await sock.sendMessage(jid, { text: 'Tidak ada pesan untuk dibintangi/dibatalkan bintangnya.' });
                    break;
                }
                try {
                    await sock.chatModify({
                        star: {
                            messages: [
                                {
                                    id: m.key.id,
                                    fromMe: m.key.fromMe // Penting untuk mencocokkan apakah pesan dari bot atau dari Anda
                                }
                            ],
                            star: actualCommand === 'starmessage' // true untuk bintang, false untuk unstar
                        }
                    }, jid);
                    await sock.sendMessage(jid, { text: `Pesan ${actualCommand === 'starmessage' ? 'dibintangi' : 'dibatalkan bintangnya'}.` });
                } catch (error) {
                    console.error('Error starring/unstarring message:', error);
                    await sock.sendMessage(jid, { text: 'Gagal melakukan operasi bintang pesan.' });
                }
                break;

            case 'ephemeral':
                try {
                    await sock.sendMessage(jid, { disappearingMessagesInChat: WA_DEFAULT_EPHEMERAL });
                    await sock.sendMessage(jid, { text: 'Pesan menghilang diaktifkan untuk chat ini (durasi default: 7 hari).' });
                } catch (error) {
                    console.error('Error setting ephemeral messages:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengaktifkan pesan menghilang.' });
                }
                break;

            case 'checkwa':
                if (actualArgs) {
                    const numberToCheck = actualArgs.replace(/[^0-9]/g, ''); // Hapus karakter non-digit
                    if (numberToCheck.length < 9) { // Contoh validasi sederhana
                         await sock.sendMessage(jid, { text: 'Nomor tidak valid. Gunakan format seperti `6281234567890`.' });
                         break;
                    }
                    const [result] = await sock.onWhatsApp(numberToCheck + '@s.whatsapp.net');
                    if (result?.exists) {
                        await sock.sendMessage(jid, { text: `Nomor ${actualArgs} ada di WhatsApp sebagai JID: ${result.jid}` });
                    } else {
                        await sock.sendMessage(jid, { text: `Nomor ${actualArgs} tidak ditemukan di WhatsApp.` });
                    }
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}checkwa <nomor WhatsApp>\` (contoh: ${usedPrefix}checkwa 6281234567890)` });
                }
                break;

            case 'fetchstatus':
                try {
                    const status = await sock.fetchStatus(sender);
                    await sock.sendMessage(jid, { text: `Status Anda: "${status.status}" pada ${new Date(status.setAt * 1000).toLocaleString('id-ID')}` });
                } catch (error) {
                    console.error('Error fetching status:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil status Anda.' });
                }
                break;

            case 'fetchpp':
                try {
                    const ppUrl = await sock.profilePictureUrl(sender, 'image');
                    if (ppUrl) {
                        await sock.sendMessage(jid, { image: { url: ppUrl }, caption: 'Ini foto profil Anda:' });
                    } else {
                        await sock.sendMessage(jid, { text: 'Anda tidak memiliki foto profil atau tidak dapat diakses.' });
                    }
                } catch (error) {
                    console.error('Error fetching profile picture:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil foto profil Anda.' });
                }
                break;

            case 'fetchbizprofile':
                try {
                    const profile = await sock.getBusinessProfile(sender);
                    if (profile && Object.keys(profile).length > 0) {
                        let bizInfo = '*Profil Bisnis Anda:*\n';
                        if (profile.description) bizInfo += `Deskripsi: ${profile.description}\n`;
                        if (profile.category) bizInfo += `Kategori: ${profile.category.localizedDisplayName || profile.category.id}\n`;
                        if (profile.websites && profile.websites.length > 0) bizInfo += `Website: ${profile.websites.map(w => w.url).join(', ')}\n`;
                        await sock.sendMessage(jid, { text: bizInfo });
                    } else {
                        await sock.sendMessage(jid, { text: 'Anda tidak memiliki profil bisnis.' });
                    }
                } catch (error) {
                    console.error('Error fetching business profile:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil profil bisnis Anda.' });
                }
                break;

            case 'groupinfo':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                try {
                    const metadata = await sock.groupMetadata(jid);
                    let groupInfo = `*Info Grup Ini:*\n`;
                    groupInfo += `ID: ${metadata.id}\n`;
                    groupInfo += `Nama: ${metadata.subject}\n`;
                    groupInfo += `Deskripsi: ${metadata.desc || 'Tidak ada'}\n`;
                    groupInfo += `Jumlah Partisipan: ${metadata.participants.length}\n`;
                    await sock.sendMessage(jid, { text: groupInfo });
                } catch (error) {
                    console.error('Error fetching group info:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil info grup. Pastikan bot ada di grup ini.' });
                }
                break;

            case 'getinvitecode':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                try {
                    const code = await sock.groupInviteCode(jid);
                    await sock.sendMessage(jid, { text: `Kode undangan grup ini: https://chat.whatsapp.com/${code}` });
                } catch (error) {
                    console.error('Error getting invite code:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mendapatkan kode undangan. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'revokeinvitecode':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                try {
                    const newCode = await sock.groupRevokeInvite(jid);
                    await sock.sendMessage(jid, { text: `Kode undangan baru: https://chat.whatsapp.com/${newCode}` });
                } catch (error) {
                    console.error('Error revoking invite code:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mencabut kode undangan. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'mygroups':
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    let groupList = '*Daftar Grup yang Anda Ikuti:*\n\n';
                    if (Object.keys(groups).length === 0) {
                        groupList += 'Tidak ada grup yang ditemukan.';
                    } else {
                        for (const groupId in groups) {
                            const group = groups[groupId];
                            groupList += `- ${group.subject} (ID: ${group.id})\n`;
                        }
                    }
                    await sock.sendMessage(jid, { text: groupList });
                } catch (error) {
                    console.error('Error fetching participating groups:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil daftar grup.' });
                }
                break;

            case 'getjoinrequests':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                try {
                    const requests = await sock.groupRequestParticipantsList(jid);
                    if (requests.length > 0) {
                        let requestList = '*Permintaan Bergabung Grup:*\n\n';
                        requests.forEach(req => {
                            requestList += `- ${req.jid.split('@')[0]} (${req.displayName || 'Anonim'})\n`;
                        });
                        await sock.sendMessage(jid, { text: requestList });
                    } else {
                        await sock.sendMessage(jid, { text: 'Tidak ada permintaan bergabung tertunda.' });
                    }
                } catch (error) {
                    console.error('Error fetching join requests:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mendapatkan permintaan bergabung. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'changestatus':
                if (actualArgs) {
                    await sock.updateProfileStatus(actualArgs);
                    await sock.sendMessage(jid, { text: `Status profil Anda berhasil diubah menjadi: "${actualArgs}"` });
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}changestatus <status baru Anda>\`` });
                }
                break;

            case 'changename':
                if (actualArgs) {
                    await sock.updateProfileName(actualArgs);
                    await sock.sendMessage(jid, { text: `Nama profil Anda berhasil diubah menjadi: "${actualArgs}"` });
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}changename <nama baru Anda>\`` });
                }
                break;

            case 'changemypp':
                if (actualArgs && actualArgs.startsWith('http')) {
                    try {
                        await sock.updateProfilePicture(sock.user.id, { url: actualArgs });
                        await sock.sendMessage(jid, { text: 'Foto profil Anda berhasil diubah.' });
                    } catch (error) {
                        console.error('Error changing profile picture:', error);
                        await sock.sendMessage(jid, { text: 'Gagal mengubah foto profil. Pastikan URL gambar valid dan publik.' });
                    }
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}changemypp <URL gambar>\` (contoh: ${usedPrefix}changemypp https://example.com/image.jpg)` });
                }
                break;

            case 'removemypp':
                try {
                    await sock.removeProfilePicture(sock.user.id);
                    await sock.sendMessage(jid, { text: 'Foto profil Anda berhasil dihapus.' });
                } catch (error) {
                    console.error('Error removing profile picture:', error);
                    await sock.sendMessage(jid, { text: 'Gagal menghapus foto profil.' });
                }
                break;

            case 'creategroup':
                if (!actualArgs) {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}creategroup <nama grup>\`` });
                    break;
                }
                try {
                    // Untuk contoh, hanya membuat grup dengan bot sebagai satu-satunya anggota awal
                    // Anda bisa menambahkan peserta lain di sini, misal: ['6281234567890@s.whatsapp.net']
                    const group = await sock.groupCreate(actualArgs, [sock.user.id]);
                    await sock.sendMessage(jid, { text: `Grup "${actualArgs}" berhasil dibuat dengan ID: ${group.id}` });
                } catch (error) {
                    console.error('Error creating group:', error);
                    await sock.sendMessage(jid, { text: 'Gagal membuat grup. Pastikan Anda memiliki izin.' });
                }
                break;

            case 'addparticipant':
            case 'removeparticipant':
            case 'promoteparticipant':
            case 'demoteparticipant':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                if (!actualArgs) {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}${actualCommand} <nomor partisipan>\` (contoh: ${usedPrefix}${actualCommand} 6281234567890)` });
                    break;
                }
                const participantJid = actualArgs.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                let action;
                switch (actualCommand) {
                    case 'addparticipant': action = 'add'; break;
                    case 'removeparticipant': action = 'remove'; break;
                    case 'promoteparticipant': action = 'promote'; break;
                    case 'demoteparticipant': action = 'demote'; break;
                }
                try {
                    await sock.groupParticipantsUpdate(jid, [participantJid], action);
                    await sock.sendMessage(jid, { text: `Operasi '${action}' berhasil untuk ${actualArgs} (memerlukan izin admin grup).` });
                } catch (error) {
                    console.error(`Error ${action}ing participant:`, error);
                    await sock.sendMessage(jid, { text: `Gagal melakukan operasi ${action}. Pastikan bot adalah admin grup dan nomor valid.` });
                }
                break;

            case 'changegroupname':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                if (actualArgs) {
                    try {
                        await sock.groupUpdateSubject(jid, actualArgs);
                        await sock.sendMessage(jid, { text: `Nama grup diubah menjadi: "${actualArgs}" (memerlukan izin admin grup).` });
                    } catch (error) {
                        console.error('Error changing group name:', error);
                        await sock.sendMessage(jid, { text: 'Gagal mengubah nama grup. Pastikan bot adalah admin grup.' });
                    }
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}changegroupname <nama baru>\`` });
                }
                break;

            case 'changegroupdesc':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                if (actualArgs) {
                    try {
                        await sock.groupUpdateDescription(jid, actualArgs);
                        await sock.sendMessage(jid, { text: `Deskripsi grup diubah menjadi: "${actualArgs}" (memerlukan izin admin grup).` });
                    } catch (error) {
                        console.error('Error changing group description:', error);
                        await sock.sendMessage(jid, { text: 'Gagal mengubah deskripsi grup. Pastikan bot adalah admin grup.' });
                    }
                } else {
                    await sock.sendMessage(jid, { text: `Gunakan: \`${usedPrefix}changegroupdesc <deskripsi baru>\`` });
                }
                break;

            case 'groupsetting':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                const setting = actualArgs.toLowerCase();
                const validSettings = ['announcement', 'not_announcement', 'locked', 'unlocked'];
                if (!validSettings.includes(setting)) {
                    await sock.sendMessage(jid, { text: `Pengaturan tidak valid. Gunakan: ${validSettings.join('|')}` });
                    break;
                }
                try {
                    await sock.groupSettingUpdate(jid, setting);
                    await sock.sendMessage(jid, { text: `Pengaturan grup diubah menjadi: "${setting}" (memerlukan izin admin grup).` });
                } catch (error) {
                    console.error('Error changing group setting:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengubah pengaturan grup. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'leavegroup':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                try {
                    await sock.groupLeave(jid);
                    // Bot tidak bisa mengirim pesan setelah keluar grup, jadi ini akan gagal
                    console.log(`Bot berhasil keluar dari grup: ${jid}`);
                } catch (error) {
                    console.error('Error leaving group:', error);
                    await sock.sendMessage(jid, { text: 'Gagal keluar dari grup.' });
                }
                break;

            case 'togglegroupephemeral':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                try {
                    // Dapatkan pengaturan ephemeral saat ini untuk menentukan apakah akan menyalakan atau mematikan
                    const metadata = await sock.groupMetadata(jid);
                    const currentEphemeralDuration = metadata.ephemeralDuration;
                    const newEphemeralDuration = currentEphemeralDuration === 0 ? WA_DEFAULT_EPHEMERAL : 0; // Toggle
                    await sock.groupToggleEphemeral(jid, newEphemeralDuration);
                    await sock.sendMessage(jid, { text: `Pesan menghilang di grup ini ${newEphemeralDuration === 0 ? 'dimatikan' : 'dinyalakan'} (durasi default: 7 hari).` });
                } catch (error) {
                    console.error('Error toggling group ephemeral:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengaktifkan/menonaktifkan pesan menghilang di grup. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'changegroupaddmode':
                if (!isGroup) {
                    await sock.sendMessage(jid, { text: 'Perintah ini hanya berlaku di grup.' });
                    break;
                }
                const addMode = actualArgs.toLowerCase();
                const validAddModes = ['all_member_add', 'admin_add'];
                if (!validAddModes.includes(addMode)) {
                    await sock.sendMessage(jid, { text: `Mode penambahan tidak valid. Gunakan: ${validAddModes.join('|')}` });
                    break;
                }
                try {
                    await sock.groupMemberAddMode(jid, addMode);
                    await sock.sendMessage(jid, { text: `Mode penambahan anggota grup diubah menjadi: "${addMode}" (memerlukan izin admin grup).` });
                } catch (error) {
                    console.error('Error changing group add mode:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengubah mode penambahan anggota grup. Pastikan bot adalah admin grup.' });
                }
                break;

            case 'blockuser':
                try {
                    await sock.updateBlockStatus(sender, 'block');
                    await sock.sendMessage(jid, { text: 'Pengguna ini telah diblokir (Anda sendiri).' });
                } catch (error) {
                    console.error('Error blocking user:', error);
                    await sock.sendMessage(jid, { text: 'Gagal memblokir pengguna.' });
                }
                break;

            case 'unblockuser':
                try {
                    await sock.updateBlockStatus(sender, 'unblock');
                    await sock.sendMessage(jid, { text: 'Pengguna ini telah dibatalkan blokirnya (Anda sendiri).' });
                } catch (error) {
                    console.error('Error unblocking user:', error);
                    await sock.sendMessage(jid, { text: 'Gagal membatalkan blokir pengguna.' });
                }
                break;

            case 'myprivacysettings':
                try {
                    const privacySettings = await sock.fetchPrivacySettings(true);
                    let settingsText = '*Pengaturan Privasi Anda:*\n';
                    for (const key in privacySettings) {
                        settingsText += `- ${key}: ${privacySettings[key]}\n`;
                    }
                    await sock.sendMessage(jid, { text: settingsText });
                } catch (error) {
                    console.error('Error fetching privacy settings:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil pengaturan privasi Anda.' });
                }
                break;

            case 'myblocklist':
                try {
                    const blocklist = await sock.fetchBlocklist();
                    if (blocklist.length > 0) {
                        let blocklistText = '*Daftar Blokir Anda:*\n';
                        blocklist.forEach(item => {
                            blocklistText += `- ${item.split('@')[0]}\n`;
                        });
                        await sock.sendMessage(jid, { text: blocklistText });
                    } else {
                        await sock.sendMessage(jid, { text: 'Daftar blokir Anda kosong.' });
                    }
                } catch (error) {
                    console.error('Error fetching blocklist:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengambil daftar blokir Anda.' });
                }
                break;

            case 'setlastseen':
            case 'setonlineprivacy':
            case 'setppprivacy':
            case 'setstatusprivacy':
            case 'setreadreceipts':
            case 'setgroupaddprivacy':
                const value = actualArgs.toLowerCase();
                let validValues;
                let updateFn;
                switch (actualCommand) {
                    case 'setlastseen':
                        validValues = ['all', 'contacts', 'contact_blacklist', 'none'];
                        updateFn = sock.updateLastSeenPrivacy;
                        break;
                    case 'setonlineprivacy':
                        validValues = ['all', 'match_last_seen'];
                        updateFn = sock.updateOnlinePrivacy;
                        break;
                    case 'setppprivacy':
                        validValues = ['all', 'contacts', 'contact_blacklist', 'none'];
                        updateFn = sock.updateProfilePicturePrivacy;
                        break;
                    case 'setstatusprivacy':
                        validValues = ['all', 'contacts', 'contact_blacklist', 'none'];
                        updateFn = sock.updateStatusPrivacy;
                        break;
                    case 'setreadreceipts':
                        validValues = ['all', 'none'];
                        updateFn = sock.updateReadReceiptsPrivacy;
                        break;
                    case 'setgroupaddprivacy':
                        validValues = ['all', 'contacts', 'contact_blacklist'];
                        updateFn = sock.updateGroupsAddPrivacy;
                        break;
                }

                if (!validValues.includes(value)) {
                    await sock.sendMessage(jid, { text: `Nilai tidak valid untuk ${actualCommand}. Gunakan: ${validValues.join('|')}` });
                    break;
                }
                try {
                    await updateFn(value);
                    await sock.sendMessage(jid, { text: `Pengaturan ${actualCommand.slice(3)} berhasil diubah menjadi: "${value}"` });
                } catch (error) {
                    console.error(`Error setting ${actualCommand.slice(3)}:`, error);
                    await sock.sendMessage(jid, { text: `Gagal mengubah pengaturan ${actualCommand.slice(3)}.` });
                }
                break;

            case 'setdefaultephemeral':
                const ephemeralTime = parseInt(actualArgs);
                const validEphemeralTimes = [0, 86400, 604800, 7776000]; // 0, 24h, 7d, 90d
                if (!validEphemeralTimes.includes(ephemeralTime)) {
                    await sock.sendMessage(jid, { text: `Waktu tidak valid. Gunakan: ${validEphemeralTimes.join('|')} (detik)` });
                    break;
                }
                try {
                    await sock.updateDefaultDisappearingMode(ephemeralTime);
                    await sock.sendMessage(jid, { text: `Mode pesan menghilang default berhasil diatur ke: ${ephemeralTime} detik.` });
                } catch (error) {
                    console.error('Error setting default ephemeral mode:', error);
                    await sock.sendMessage(jid, { text: 'Gagal mengatur mode pesan menghilang default.' });
                }
                break;

            case 'profile':
                if (userDatabase[sender]) {
                    const profileText = `
*Profil Anda:*
Nama: ${userDatabase[sender].name}
ID Pengguna: ${sender}
Terakhir Aktif: ${new Date(userDatabase[sender].lastActivity).toLocaleString('id-ID')}
Jumlah Pesan Dikirim: ${userDatabase[sender].count}
                    `.trim();
                    await sock.sendMessage(jid, { text: profileText });
                } else {
                    await sock.sendMessage(jid, { text: 'Profil Anda belum terdaftar. Coba kirim pesan lain.' });
                }
                break;

            case 'stats':
                const sortedUsers = Object.entries(userDatabase).sort(([, a], [, b]) => b.count - a.count);
                let statsText = '*Statistik Penggunaan Bot:*\n\n';
                sortedUsers.slice(0, 10).forEach(([id, data], index) => {
                    statsText += `${index + 1}. ${data.name} (${id.split('@')[0]}): ${data.count} pesan\n`;
                });
                await sock.sendMessage(jid, { text: statsText });
                break;

            default:
                // Hanya merespon jika pesan dimulai dengan prefix dan tidak ada perintah yang cocok
                if (isCommand) {
                    console.log("command tidak ada")
                    // await sock.sendMessage(jid, { text: `Maaf, perintah \`${usedPrefix}${actualCommand}\` tidak dikenal. Ketik \`${usedPrefix}menu\` untuk melihat daftar perintah.` });
                }
                break;
        }
    } catch (error) {
        console.error('Error in handlePesan:', error);
        // await sock.sendMessage(jid, { text: 'Terjadi kesalahan saat memproses permintaan Anda.' });
    }
}

module.exports = handlePesan;
