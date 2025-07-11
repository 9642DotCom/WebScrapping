const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, 'users.json');

function readUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function authenticate(login, password) {
    const users = readUsers();
    // Permite login por username OU email
    const user = users.find(u => (u.username === login || u.email === login) && u.password === password);
    if (!user) return null;
    
    // Gera token simples (não use em produção)
    const token = crypto.randomBytes(16).toString('hex');
    
    // Atualiza o usuário com o novo token
    if (!user.tokens) {
        user.tokens = [];
    }
    user.tokens.push(token);
    
    // Atualiza o usuário no array de usuários
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
        users[userIndex] = user;
        writeUsers(users);
    }
    
    // Retorna os dados do usuário com o token
    return { ...user, token };
}

function getUserByToken(token) {
    if (!token) return null;
    const users = readUsers();
    // Verifica se o token está no array de tokens do usuário
    return users.find(u => u.tokens && u.tokens.includes(token));
}

function updateUser(user) {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
        users[idx] = user;
        writeUsers(users);
    }
}

module.exports = { authenticate, getUserByToken, updateUser };
