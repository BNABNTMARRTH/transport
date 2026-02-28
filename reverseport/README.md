# ReversePort 🚀

ReversePort is a lightweight, multi-user reverse tunneling service built with Node.js. It allows you to expose local ports (like `localhost:3000`) to the public internet through custom subdomains (e.g., `user.reverseport.net`).

## Features
- **Multiplexed Design**: Uses separate Control and Data channels to handle concurrent requests reliably.
- **Subdomain Routing**: Dynamically routes traffic based on the incoming Host header.
- **Raw TCP Proxying**: Bypasses complex HTTP parsing for maximum performance and stability.
- **Multi-user Support**: Connect multiple clients simultaneously with unique subdomains.

## Architecture
- **Server (The Hub)**: Runs on a VPS with a public IP. Listens for tunnel connections on port 8080 and public HTTP traffic on port 80.
- **Client (The Agent)**: Runs on your local machine. Connects to the Hub and forwards traffic to your local port.

## Setup

### Server
1. Point your domain's A records (including a wildcard `*`) to your VPS IP.
2. Install Node.js and PM2.
3. Run `npm install` in the `server` directory.
4. Start with `pm2 start index.js --name "reverseport-server"`.

### Client
1. Run `npm install` in the `client` directory.
2. Start the tunnel:
   ```bash
   node index.js --subdomain yourname --localPort 3000
   ```
3. Access your app at `http://yourname.yourdomain.com`.

## To-Do
- [ ] SSL/TLS (HTTPS) support with Certbot.
- [ ] API Key authentication for security.
- [ ] Web dashboard for monitoring tunnels.

---
Built with ❤️ by Antigravity (Advanced Agentic Coding) for benavente.
