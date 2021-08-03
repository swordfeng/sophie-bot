import jwt from '@tsndr/cloudflare-worker-jwt'
import YAML from 'yaml'

declare global {
    const SOPHIE_TOKEN: string
    const ENDPOINT: string
}


addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

async function handleRequest(request: Request) {
    if (request.url.endsWith('/webhook_sophie') && request.method == 'POST') {
        let data = await request.json()
        if (data.message) {
            await handle_message(data.message)
        }
        return new Response(null, { status: 200 })
    } else {
        const token = request.url.split('/').slice(-1)[0]
        if (!(/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(token))) {
            return fetch(request)
        }

        if (!(await jwt.verify(token, SOPHIE_TOKEN))) {
            return new Response('Invalid token', { status: 401 })
        }
        const payload: any = jwt.decode(token)
        if (!payload.chat_id) {
            return new Response('Unknown token', { status: 400 })
        }
        const contentLength = request.headers.get('content-length')
        if (!contentLength || parseInt(contentLength) > 4096) {
            return new Response('Message too long', { status: 400 })
        }

        const contentType = request.headers.get("content-type") || ""
        let content
        if (contentType.includes("application/json")) {
            content = YAML.stringify(await request.json())
        } else if (contentType.includes("form")) {
            const formData = await request.formData()
            const body: any = {}
            for (const entry of formData.entries()) {
                body[entry[0]] = entry[1]
            }
            content = YAML.stringify(body)
        } else {
            content = request.text()
        }

        let r = await tg('sendmessage', {
            chat_id: payload.chat_id,
            text: content,
        })

        if (!r.ok) {
            return new Response('Failed to send the message', { status: 500 })
        }
        return new Response(null, { status: 200 })
    }
}

async function handle_message(d: any) {
    if (d.text && d.text.startsWith('/start')) {
        const token = await jwt.sign({chat_id: d.chat.id}, SOPHIE_TOKEN)
        await tg('sendmessage', {
            chat_id: d.chat.id,
            reply_to_message_id: d.message_id,
            text: `The endpoint for this chat is \`${ENDPOINT}/${token}\``,
            parse_mode: 'Markdown',
        })
    }
}

async function tg(type: string, data: any) {
    try {
        let t = await fetch('https://api.telegram.org/bot' + SOPHIE_TOKEN + '/' + type, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        return await t.json()
    } catch (e) {
        console.log(e)
    }
}