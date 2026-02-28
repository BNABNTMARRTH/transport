const net = require('net');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const http = require('http');

const HTTP_PORT = 80;
const TUNNEL_PORT = 8080;

const controlConnections = new Map(); // subdomain -> controlSocket
const pendingRequests = new Map();   // requestId -> { reqSocket }

const app = express();

const tunnelServer = net.createServer((socket) => {
    socket.once('data', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            // 1. Registro de Canal de Control
            if (msg.type === 'control') {
                const { subdomain } = msg;
                console.log(`Control Channel activo: ${subdomain}`);
                controlConnections.set(subdomain, socket);

                socket.on('close', () => {
                    if (controlConnections.get(subdomain) === socket) {
                        controlConnections.delete(subdomain);
                    }
                });
            }

            // 2. Registro de Canal de Datos
            else if (msg.type === 'data') {
                const { requestId } = msg;
                const pending = pendingRequests.get(requestId);

                if (pending) {
                    console.log(`Data Channel vinculado para request: ${requestId}`);
                    pendingRequests.delete(requestId);

                    const { reqSocket, head } = pending;

                    // Raw piping: conectar el socket HTTP que entró, directo al túnel del VPS
                    reqSocket.pipe(socket).pipe(reqSocket);

                    // Si ya habíamos leído algo del socket original (el header inicial), mandarlo primero
                    if (head && head.length > 0) {
                        socket.write(head);
                    }

                    // Despausar el socket original
                    reqSocket.resume();

                    reqSocket.on('error', () => { socket.destroy(); });
                    socket.on('error', () => { reqSocket.destroy(); });

                } else {
                    socket.destroy();
                }
            }
        } catch (e) {
            socket.destroy();
        }
    });

    socket.on('error', () => { });
});

tunnelServer.listen(TUNNEL_PORT, () => console.log(`🚀 Hub de túneles en ${TUNNEL_PORT}`));

// Interceptamos las conexiones desde el nivel más bajo (TCP) del servidor HTTP
const httpServer = http.createServer();

httpServer.on('connection', (reqSocket) => {
    reqSocket.once('data', (data) => {
        // Pausar inmediatamente
        reqSocket.pause();

        const reqStr = data.toString();
        // Buscamos el header Host:
        const hostMatch = reqStr.match(/Host:\s*([^\s:]+)/i);

        if (hostMatch) {
            const host = hostMatch[1];
            const subdomain = host.split('.')[0];
            const controlSocket = controlConnections.get(subdomain);

            if (controlSocket && !controlSocket.destroyed) {
                const requestId = uuidv4();
                pendingRequests.set(requestId, { reqSocket, head: data });

                // Pedirle al cliente que abra el data channel
                controlSocket.write(JSON.stringify({ type: 'create_connection', requestId }));

                // Timeout a los 10 segundos
                setTimeout(() => {
                    if (pendingRequests.has(requestId)) {
                        pendingRequests.delete(requestId);
                        if (reqSocket.writable) {
                            reqSocket.write('HTTP/1.1 504 Gateway Time-out\r\n\r\n');
                            reqSocket.destroy();
                        }
                    }
                }, 10000);
            } else {
                if (reqSocket.writable) {
                    reqSocket.write('HTTP/1.1 404 Not Found\r\n\r\nSubdominio no activo.');
                    reqSocket.destroy();
                }
            }
        } else {
            // Si no hay Host, lo botamos
            reqSocket.destroy();
        }
    });
});

httpServer.listen(HTTP_PORT, () => console.log(`🌍 Servidor Web RAW en ${HTTP_PORT}`));
