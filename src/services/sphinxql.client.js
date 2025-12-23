const net = require('net');
const { logger } = require('../middleware/errorHandler');


class SphinxQLClient {
    constructor(options = {}) {
        this.host = options.host || 'localhost';
        this.port = options.port || 9306;
        this.socket = null;
        this.connected = false;
    }

    
    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            
            this.socket.connect(this.port, this.host, () => {
                this.connected = true;
                logger.info('SphinxQL connection established', { 
                    host: this.host, 
                    port: this.port 
                });
                
                this.socket.once('data', (data) => {
                    resolve(true);
                });
            });

            this.socket.on('error', (error) => {
                this.connected = false;
                logger.error('SphinxQL connection error:', error);
                reject(error);
            });

            this.socket.on('close', () => {
                this.connected = false;
                logger.info('SphinxQL connection closed');
            });
        });
    }

    
    async query(sql, params = []) {
        if (!this.connected || !this.socket) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const query = sql + '\n';
            this.socket.write(query);

            let buffer = Buffer.alloc(0);
            const onData = (data) => {
                buffer = Buffer.concat([buffer, data]);
                
                const content = buffer.toString();
                if (content.includes('\n\n') || content.includes('rows in set')) {
                    this.socket.removeListener('data', onData);
                    
                    try {
                        const results = this.parseResults(content);
                        resolve([results]);
                    } catch (error) {
                        reject(error);
                    }
                }
            };

            this.socket.on('data', onData);

            setTimeout(() => {
                this.socket.removeListener('data', onData);
                reject(new Error('Query timeout'));
            }, 30000);
        });
    }

    
    parseResults(content) {
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            return [];
        }

        if (content.includes('Index') && content.includes('Type')) {
            const results = [];
            let dataStarted = false;
            
            for (const line of lines) {
                if (line.includes('---')) {
                    dataStarted = true;
                    continue;
                }
                
                if (dataStarted && line.trim() && !line.includes('rows in set')) {
                    const parts = line.split('\t').map(p => p.trim());
                    if (parts.length >= 2) {
                        results.push({
                            Index: parts[0],
                            Type: parts[1]
                        });
                    }
                }
            }
            return results;
        }

        if (content.includes('Counter') && content.includes('Value')) {
            const results = [];
            let dataStarted = false;
            
            for (const line of lines) {
                if (line.includes('---')) {
                    dataStarted = true;
                    continue;
                }
                
                if (dataStarted && line.trim() && !line.includes('rows in set')) {
                    const parts = line.split('\t').map(p => p.trim());
                    if (parts.length >= 2) {
                        results.push({
                            Counter: parts[0],
                            Value: parts[1]
                        });
                    }
                }
            }
            return results;
        }

        if (content.includes('id') && (content.includes('title') || content.includes('weight'))) {
            const results = [];
            const headerLine = lines.find(line => line.includes('id') && (line.includes('title') || line.includes('weight')));
            
            if (!headerLine) return results;
            
            const headers = headerLine.split('\t').map(h => h.trim());
            const headerIndex = lines.indexOf(headerLine);
            
            for (let i = headerIndex + 2; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim() || line.includes('rows in set')) break;
                
                const values = line.split('\t').map(v => v.trim());
                const row = {};
                
                headers.forEach((header, index) => {
                    if (values[index] !== undefined) {
                        const value = values[index];
                        if (!isNaN(value) && value !== '') {
                            row[header] = parseFloat(value);
                        } else {
                            row[header] = value || '';
                        }
                    }
                });
                
                results.push(row);
            }
            return results;
        }

        return [];
    }

    
    async close() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
            this.connected = false;
        }
    }
}

module.exports = SphinxQLClient;