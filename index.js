// index.js
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    useSingleFileAuthState,
    downloadMediaMessage
} = require("@whiskeysockets/baileys")
const { Boom } = require('@hapi/boom'); // Perlu diinstal jika belum: npm install @hapi/boom
const pino = require('pino'); // Untuk logging: npm install pino
const fs = require('fs').promises; // Untuk operasi file asynchronous
const path = require('path'); // Untuk menangani path file
const handlePesan = require('./function/pesan'); // Import fungsi handlePesan
const config = require('./config'); // Import konfigurasi
const readline = require('readline')

// Path ke database pengguna
const USER_DATABASE_PATH = path.resolve(__dirname, 'database', 'user.json');

const usePairingCode = true;

// Cache untuk metadata grup (opsional, untuk performa)
const groupCache = new Map();

// Fungsi untuk memuat database pengguna
async function loadUserDatabase() {
    try {
        const data = await fs.readFile(USER_DATABASE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('User database file not found. Creating a new one.');
            return {}; // Return empty object if file doesn't exist
        }
        console.error('Failed to load user database:', error);
        return {}; // Return empty object on other errors
    }
}

// Fungsi untuk menyimpan database pengguna
async function saveUserDatabase(data) {
    try {
        await fs.mkdir(path.dirname(USER_DATABASE_PATH), { recursive: true }); // Pastikan direktori ada
        await fs.writeFile(USER_DATABASE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save user database:', error);
    }
}

async function connectToWhatsApp() {
    // Muat database pengguna
    let userDatabase = await loadUserDatabase();

    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
	const sock = makeWASocket({
		printQRInTerminal: !usePairingCode,
		syncFullHistory: true,
		markOnlineOnConnect: true,
		connectTimeoutMs: 60000,
		defaultQueryTimeoutMs: 0,
		keepAliveIntervalMs: 10000,
		generateHighQualityLinkPreview: true,
		patchMessageBeforeSending: (message) => {
			const requiresPatch = !!(
				message.buttonsMessage ||
				message.templateMessage ||
				message.listMessage
			);
			if (requiresPatch) {
				message = {
					viewOnceMessage: {
						message: {
							messageContextInfo: {
								deviceListMetadataVersion: 2,
								deviceListMetadata: {},
							},
							...message,
						},
					},
				};
			}

			return message;
		},
		version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
		browser: ["Ubuntu", "Chrome", "20.0.04"],
		logger: pino({
			level: 'fatal'
		}),
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, pino().child({
				level: 'silent',
				stream: 'store'
			})),
		}
	});

    if (usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = await prompt('please enter your WhatsApp number, starting with 62:\n');
        const code = await sock.requestPairingCode(phoneNumber, 'NAFFDEVV');
        console.log(`your pairing code: ${code}`);
        }
    
        const store = makeInMemoryStore({
            logger: pino().child({ 
                level: 'silent',
                stream: 'store' 
            }) 
        });
        
        store.bind(sock.ev);

    // Event listener untuk update koneksi
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) connectToWhatsApp()
        } else if (connection === "open") {
            console.clear();
            console.log(`
        ╔═════════════════════════════════════════════╗
        ║          🤖 BOT WHATSAPP TERHUBUNG         ║
        ╚═════════════════════════════════════════════╝
        
        📶 Status     : Tersambung ke WhatsApp Web
        🔧 Mode       : ${currentMode?.toUpperCase() || config.MODE.toUpperCase()}
        📁 Session    : ./session
        
        ───────────────────────────────────────────────
        🔰 Bot by     : NaffDev
        📌 Info      : No Enc - Hubungi Naff Dev
        FB            : Naff Maulana
        ───────────────────────────────────────────────
        `);
       
    }
})

    sock.ev.on("creds.update", saveCreds)

    // Event listener untuk update grup (anggota, metadata)
    sock.ev.on('groups.update', async ([event]) => {
        if (event.id) {
            try {
                const metadata = await sock.groupMetadata(event.id);
                groupCache.set(event.id, metadata);
                console.log(`Group metadata updated for ${event.id}`);
            } catch (e) {
                console.error(`Failed to update group metadata for ${event.id}:`, e);
            }
        }
    });

    sock.ev.on('group-participants.update', async (event) => {
        if (event.id) {
            try {
                const metadata = await sock.groupMetadata(event.id);
                groupCache.set(event.id, metadata);
                console.log(`Group participants updated for ${event.id}`);
            } catch (e) {
                console.error(`Failed to update group participants for ${event.id}:`, e);
            }
        }
    });

    // Event listener untuk pesan masuk (termasuk media)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const m of messages) {
                // Abaikan pesan dari diri sendiri atau jika tidak ada konten pesan
                // if (!m.message || m.key.fromMe) continue;
                if (!m.message ) continue;

                const jid = m.key.remoteJid;
                const isGroup = jid.endsWith('@g.us');

                // Logika mode self/public
                if (config.MODE === 'self' && isGroup) {
                    // Jika mode 'self' dan pesan dari grup, jangan merespon
                    console.log(`[MODE SELF] Mengabaikan pesan dari grup: ${jid}`);
                    continue; // Lanjutkan ke pesan berikutnya
                }

                // console.log(`Pesan diterima dari ${jid}:`, JSON.stringify(m.message, undefined, 2));
                console.log(`Pesan diterima dari ${jid}:`);

                // Panggil fungsi handlePesan dari function/pesan.js
                // Teruskan juga mode konfigurasi ke handlePesan jika diperlukan
                await handlePesan(sock, m, userDatabase, saveUserDatabase, config.MODE);
            }
        }
    });

    // Event listener untuk update pesan (contoh: untuk poll votes)
    sock.ev.on('messages.update', async (events) => {
        for (const { key, update } of events) {
            if (update.pollUpdates) {
                console.log('Menerima update polling:', update.pollUpdates);
            }
        }
    });
}

function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise(resolve => rl.question(question, ans => {
        rl.close()
        resolve(ans.trim())
    }))
}

// Jalankan fungsi utama
connectToWhatsApp();
