const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { authenticate, getUserByToken, updateUser } = require('./auth');
const { exportToCSV } = require('./export');

const app = express();
const port = 3000;

// Servir arquivos estáticos (HTML, CSS, JS, imagens) da pasta atual
app.use(express.static(__dirname));

// Aumentando o limite do body parser e garantindo que ele está configurado corretamente
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Adicionar middleware para debug de requisições
app.use((req, res, next) => {
    console.log('🔍 Nova requisição:');
    console.log('📍 URL:', req.url);
    console.log('📦 Headers:', req.headers);
    console.log('📝 Body:', JSON.stringify(req.body, null, 2));
    next();
});

// Middleware para autenticação
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token de autenticação não fornecido' });
    }
    const user = getUserByToken(token);
    if (!user) {
        return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
    }
    req.user = user;
    next();
}

// Rota de login
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
        }
        
        const result = authenticate(username, password);
        if (!result) {
            return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
        
        // Remove a senha do objeto de retorno
        const { password: _, ...userWithoutPassword } = result;
        
        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            token: result.token,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar o login' });
    }
});

// Rota de registro
app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validação dos campos
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios' });
        }
        
        if (username.length < 4) {
            return res.status(400).json({ success: false, message: 'O nome de usuário deve ter pelo menos 4 caracteres' });
        }
        
        if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
            return res.status(400).json({ success: false, message: 'E-mail inválido' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 6 caracteres' });
        }
        
        // Verifica se o usuário ou e-mail já existe
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
        const userExists = users.some(u => u.username === username || u.email === email);
        
        if (userExists) {
            return res.status(400).json({ success: false, message: 'Nome de usuário ou e-mail já está em uso' });
        }
        
        // Cria o novo usuário
        const newUser = {
            id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            email,
            password, // Em produção, isso deve ser um hash da senha
            credits: 10, // Créditos iniciais
            history: [],
            tokens: []
        };
        
        // Gera um token para o novo usuário
        const token = crypto.randomBytes(16).toString('hex');
        newUser.tokens = [token];
        
        // Adiciona o novo usuário ao array de usuários
        users.push(newUser);
        fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
        
        // Remove a senha do objeto de retorno
        const { password: _, ...userWithoutPassword } = newUser;
        
        res.status(201).json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            token,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar o registro' });
    }
});

// Middleware de autenticação
function requireAuth(req, res, next) {
    const token = req.headers['authorization'] || req.query.token || (req.body && req.body.token);
    if (!token) return res.status(401).json({ erro: 'Não autenticado' });
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ erro: 'Token inválido' });
    req.user = user;
    next();
}

// Rota de cadastro
app.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Usuário, e-mail e senha são obrigatórios.' });
    }
    if (username.length < 4) {
        return res.status(400).json({ success: false, message: 'Usuário deve ter pelo menos 4 caracteres.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'E-mail inválido.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Senha deve ter pelo menos 6 caracteres.' });
    }
    let users = [];
    try {
        users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Erro ao acessar base de usuários.' });
    }
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'Usuário já existe.' });
    }
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'E-mail já cadastrado.' });
    }
    const newUser = {
        id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
        username,
        email,
        password,
        credits: 15, // Créditos iniciais personalizados
        history: []
    };
    users.push(newUser);
    fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// Rota de login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = authenticate(username, password);
    if (!user) return res.json({ success: false, message: 'Usuário ou senha inválidos' });
    res.json({ success: true, token: user.token, credits: user.credits });
});

// Rota para simular compra de créditos
app.post('/comprar-creditos', requireAuth, (req, res) => {
    const { quantidade } = req.body;
    if (!quantidade || quantidade <= 0) return res.status(400).json({ erro: 'Quantidade inválida' });
    req.user.credits += Number(quantidade);
    updateUser(req.user);
    res.json({ success: true, credits: req.user.credits });
});

// Rota para gerar cobrança Pix com Efi Pay
app.post('/gerar-cobranca', requireAuth, async (req, res) => {
    try {
        const { valor } = req.body;
        if (!valor || !['10','45','80'].includes(String(valor))) {
            return res.status(400).json({ erro: 'Valor inválido' });
        }
        const efipay = require('./efipay');
        const cobranca = await efipay.criarCobranca(valor, req.user);
        // Salvar txid e valor no usuário para mapear no webhook
        if (!req.user.cobrancas) req.user.cobrancas = [];
        req.user.cobrancas.push({
            txid: cobranca.txid,
            valor: Number(valor),
            data: new Date().toISOString()
        });
        require('./auth').updateUser(req.user);
        res.json({ qrCode: cobranca.qrCode, qrCodeImage: cobranca.qrCodeImage, txid: cobranca.txid });
    } catch (e) {
        console.error('Erro ao gerar cobrança Pix:', e && e.message, e);
        res.status(500).json({ erro: e && e.message ? e.message : 'Erro ao gerar cobrança Pix', detalhes: (e && e.stack) ? e.stack : e });
    }
});

// Rota para exportar CSV de qualquer busca do histórico
app.get('/exportar-csv', requireAuth, (req, res) => {
    let idx = req.query.idx;
    let historyItem = null;
    if (typeof idx !== 'undefined') {
        idx = parseInt(idx);
        if (isNaN(idx) || !req.user.history || idx < 0 || idx >= req.user.history.length) {
            return res.status(400).json({ erro: 'Índice de histórico inválido.' });
        }
        historyItem = req.user.history[idx];
    } else {
        historyItem = req.user.history && req.user.history.length > 0 ? req.user.history[req.user.history.length - 1] : null;
    }
    if (!historyItem || !historyItem.estabelecimentos) return res.status(400).json({ erro: 'Nenhuma busca encontrada para exportar.' });
    const filePath = exportToCSV(historyItem.estabelecimentos, `contatos_${req.user.username}_${idx || req.user.history.length-1}.csv`);
    if (!filePath) return res.status(500).json({ erro: 'Erro ao exportar CSV.' });
    res.download(filePath);
});

// Rota para histórico de buscas
app.get('/historico', requireAuth, (req, res) => {
    res.json({ history: req.user.history || [] });
});

// Função para extrair números de WhatsApp de uma página (se necessário)
async function extrairNumerosWhatsApp(url) {
    console.log('🌐 Iniciando extração para URL:', url);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
        console.log('⏳ Aguardando carregamento da página...');
        await page.goto(url, { 
            waitUntil: 'networkidle0', 
            timeout: 30000 
        });
        
        console.log('🔍 Buscando números na página...');
        const numeros = await page.evaluate(() => {
            const regex = /(?:\+55|55)?(?:\s|-)?\(?[1-9]{2}\)?(?:\s|-)?(?:9\s?)?\d{4}(?:\s|-)?\d{4}/g;
            const conteudo = document.body.innerText;
            return [...new Set(conteudo.match(regex) || [])];
        });

        console.log(`✅ Encontrados ${numeros.length} números nesta página`);
        await browser.close();
        return numeros;
    } catch (error) {
        console.error('❌ Erro durante extração:', error.message);
        await browser.close();
        return [];
    }
}

// Rota para realizar a busca no Google Maps e extrair números
app.post('/buscar-whatsapp', requireAuth, async (req, res) => {
    try {
        // Adicionando logs para debug
        console.log('📝 Body recebido:', req.body);
        
        const { termo_busca, quantidade = 50, user_id } = req.body;
        
        // Validação dos campos obrigatórios
        if (!termo_busca || !user_id) {
            console.error('❌ Campos obrigatórios faltando');
            return res.status(400).json({
                erro: 'termo_busca e user_id são obrigatórios',
                recebido: req.body
            });
        }
        // Controle de créditos
        if (req.user.credits <= 0) {
            return res.status(402).json({ erro: 'Créditos insuficientes. Compre mais créditos para continuar.' });
        }
        req.user.credits -= 1;
        
        console.log('🔍 Iniciando busca para:', termo_busca, 'Quantidade desejada:', quantidade, 'User ID:', user_id);

        console.log('🌐 Iniciando navegador Puppeteer...');
        const browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized'
            ]
        });
        const page = await browser.newPage();

        await page.setViewport({ width: 1366, height: 768 });

        const googleUrl = `https://www.google.com/maps/search/${encodeURIComponent(termo_busca)}?hl=pt-BR`;
        console.log('🗺️ Acessando Google Maps:', googleUrl);
        await page.goto(googleUrl);

        await page.waitForSelector('.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde.ecceSd', { timeout: 60000 });
        
        console.log('📜 Rolando página para carregar todos os resultados...');
        await page.evaluate(async (quantidadeDesejada) => {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            async function autoScroll(targetCount) {
                const scrollableDiv = document.querySelector('div[role="feed"]');
                if (!scrollableDiv) return;

                let lastHeight = scrollableDiv.scrollHeight;
                let currentItems = 0;
                
                while (true) {
                    currentItems = document.querySelectorAll('.Nv2PK.THOPZb.CpccDe').length;
                    
                    // Parar exatamente quando atingir a quantidade desejada
                    if (currentItems >= targetCount) {
                        console.log(`Meta atingida: ${currentItems}/${targetCount} items`);
                        break;
                    }

                    scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
                    await sleep(1000);

                    if (scrollableDiv.scrollHeight === lastHeight) {
                        await sleep(2000);
                        if (scrollableDiv.scrollHeight === lastHeight) break;
                    }
                    lastHeight = scrollableDiv.scrollHeight;
                }
            }

            await autoScroll(quantidadeDesejada);
        }, quantidade);

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('📍 Coletando informações dos estabelecimentos...');
        const estabelecimentos = await page.evaluate((quantidadeDesejada) => {
            const results = [];
            const items = document.querySelectorAll('.Nv2PK.THOPZb.CpccDe');
            
            // Limitar ao número exato de itens solicitados
            const itemsToProcess = Math.min(items.length, quantidadeDesejada);
            
            for (let i = 0; i < itemsToProcess; i++) {
                const item = items[i];
                try {
                    const nomeEmpresa = item.querySelector('.qBF1Pd')?.textContent?.trim() || '';
                    const avaliacaoElement = item.querySelector('.MW4etd');
                    const reviewsElement = item.querySelector('.UY7F9');
                    const avaliacao = avaliacaoElement ? avaliacaoElement.textContent : '';
                    const reviews = reviewsElement ? reviewsElement.textContent.replace(/[()]/g, '') : '';
                    const endereco = item.querySelector('.W4Efsd span:last-child')?.textContent?.trim() || '';
                    const horarioElement = item.querySelector('.W4Efsd span span[style*="color: rgba(25,134,57,1.00)"]');
                    const horarioComplemento = horarioElement?.nextElementSibling?.textContent || '';
                    const horario = (horarioElement ? horarioElement.textContent : '') + horarioComplemento;
                    const link = item.querySelector('a.hfpxzc')?.href || '';

                    results.push({
                        nome: nomeEmpresa,
                        avaliacao: avaliacao,
                        reviews: reviews,
                        endereco: endereco,
                        horario: horario,
                        link: link
                    });
                    console.log(`Processing item ${i + 1}`);
                } catch (error) {
                    console.error(`Error processing item ${i + 1}:`, error);
                }
            }
            return results;
        }, quantidade);

        console.log(`📊 Encontrados ${estabelecimentos.length} estabelecimentos. Coletando telefones...`);

        for (let estabelecimento of estabelecimentos) {
            try {
                if (estabelecimento.link) {
                    await page.goto(estabelecimento.link);
                    
                    try {
                        console.log(`🔍 Tentando coletar dados de ${estabelecimento.nome}...`);
                        
                        const timeout = 10000; 
                        const waitTime = 1000; 

                        await Promise.all([
                            page.waitForSelector('h1.DUwDvf.lfPIob', { timeout }),
                            page.waitForSelector('.Io6YTe.fontBodyMedium.kR99db.fdkmkc', { timeout })
                        ]).catch(e => console.log('⚠️ Alguns elementos não foram encontrados:', e.message));
                        
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        
                        const dadosDetalhados = await page.evaluate(() => {
                            const nomeElement = document.querySelector('h1.DUwDvf.lfPIob');
                            const nome = nomeElement ? nomeElement.textContent.trim() : '';
                            const telefoneElement = document.querySelector('button.CsEnBe[data-item-id^="phone:tel"]');
                            const telefone = telefoneElement ? 
                                telefoneElement.getAttribute('aria-label').replace('Telefone: ', '').trim() : '';
                            const enderecoElement = document.querySelector('button.CsEnBe[data-item-id="address"]');
                            const endereco = enderecoElement ? 
                                enderecoElement.getAttribute('aria-label').replace('Endereço: ', '').trim() : '';
                            const websiteElement = document.querySelector('a.CsEnBe[data-item-id="authority"]');
                            const website = websiteElement ? websiteElement.href : '';
                            const horarioElement = document.querySelector('.o0Svhf .ZDu9vd span');
                            const horario = horarioElement ? horarioElement.textContent.trim() : '';
                            const avaliacaoElement = document.querySelector('.F7nice span[aria-hidden="true"]');
                            const avaliacao = avaliacaoElement ? avaliacaoElement.textContent.trim() : '';
                            const numAvaliacoesElement = document.querySelector('.F7nice span[aria-label*="avaliações"]');
                            const numAvaliacoes = numAvaliacoesElement ? 
                                numAvaliacoesElement.getAttribute('aria-label').match(/\d+/)[0] : '';
                            const categoriaElement = document.querySelector('button.DkEaL');
                            const categoria = categoriaElement ? categoriaElement.textContent.trim() : '';

                            return {
                                nome,
                                telefone,
                                endereco,
                                website,
                                horario,
                                avaliacao,
                                numAvaliacoes,
                                categoria
                            };
                        });

                        if (dadosDetalhados.nome) {
                            Object.assign(estabelecimento, dadosDetalhados);
                        }

                    } catch (error) {
                        console.log(`⚠️ Erro ao coletar dados principais:`, error.message);
                        console.log(`⚠️ Tentando método alternativo para ${estabelecimento.nome}...`);
                        
                        try {
                            await new Promise(resolve => setTimeout(resolve, 8000));
                            
                            const dadosAlternativos = await page.evaluate(() => {
                                const content = document.body.textContent;
                                const patterns = [
                                    /\(71\)\s*9?\d{4}[-\s]?\d{4}/g,
                                    /71\s*9?\d{4}[-\s]?\d{4}/g,
                                    /\d{5}[-\s]?\d{4}/g
                                ];
                                
                                for (let pattern of patterns) {
                                    const matches = content.match(pattern);
                                    if (matches) {
                                        return matches[0].replace(/[^0-9]/g, '');
                                    }
                                }
                                
                                return '';
                            });

                            if (dadosAlternativos) {
                                estabelecimento.telefone = dadosAlternativos;
                                console.log(`✅ Telefone encontrado (método alternativo) para ${estabelecimento.nome}: ${dadosAlternativos}`);
                            }
                        } catch (altError) {
                            console.error(`❌ Erro no método alternativo:`, altError.message);
                        }
                    }

                    console.log('⏳ Aguardando antes de próxima requisição...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`❌ Erro ao coletar dados para ${estabelecimento.nome}:`, error);
                continue;
            }
        }

        const resultados = {
            termo_busca,
            numeros: estabelecimentos.map(est => est.telefone).filter(tel => tel),
            estabelecimentos: estabelecimentos,
            data_busca: new Date().toISOString(),
            user_id
        };

        // Enviando resultados para o Supabase Function
        try {
            console.log('📤 Enviando resultados para Supabase Function...');
            const supabaseResponse = await fetch('https://pvjcpgvkmolgtvdaqlzi.supabase.co/functions/v1/extrair-whatsapp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultados)
            });

            if (!supabaseResponse.ok) {
                throw new Error(`Erro ao enviar para Supabase: ${supabaseResponse.statusText}`);
            }

            console.log('✅ Dados enviados com sucesso para Supabase!');
        } catch (error) {
            console.error('❌ Erro ao enviar para Supabase:', error.message);
        }

        // Mantendo o salvamento local em JSON
        try {
            const jsonPath = path.join(__dirname, 'json.json');
            fs.writeFileSync(
                jsonPath,
                JSON.stringify(resultados, null, 2)
            );
            console.log('✅ Resultados salvos localmente com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao salvar arquivo JSON:', error);
        }

        console.log('✨ Processo finalizado com sucesso!');
        await browser.close();
        // Salvar histórico do usuário (busca em andamento)
        if (!req.user.history) req.user.history = [];
        // Adiciona ao histórico imediatamente, mas só com status 'em andamento' e sem estabelecimentos ainda
        req.user.history.push({
            termo_busca,
            data_busca: resultados.data_busca,
            estabelecimentos: [],
            status: 'em andamento'
        });
        updateUser(req.user);

        // Agora, atualizar para concluída e preencher resultados
        // Encontrar o índice do último item 'em andamento' com mesmo termo e data
        const idx = req.user.history.findIndex(item => item.termo_busca === termo_busca && item.data_busca === resultados.data_busca && item.status === 'em andamento');
        if (idx !== -1) {
            req.user.history[idx] = {
                termo_busca,
                data_busca: resultados.data_busca,
                estabelecimentos: resultados.estabelecimentos,
                status: 'concluída'
            };
            updateUser(req.user);
        }
        res.json({ ...resultados, credits: req.user.credits });

    } catch (error) {
        console.error('🚨 Erro crítico:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Rota de teste
app.post('/teste', (req, res) => {
    console.log('📝 Body recebido no teste:', req.body);
    res.json({
        recebido: req.body,
        sucesso: true
    });
});

// Webhook para notificações Pix da Efi Pay
app.post('/webhook-efipay', async (req, res) => {
    try {
        const notificacao = req.body;
        console.log('🔔 Webhook Efi Pay recebido:', JSON.stringify(notificacao));
        // O txid e status ficam em notificacao.pix[0]
        if (notificacao.pix && Array.isArray(notificacao.pix)) {
            for (const pix of notificacao.pix) {
                if (pix.status === 'CONCLUIDA') {
                    const txid = pix.txid;
                    // Mapear txid para usuário e valor
                    // Exemplo: txid = 'CRED<timestamp><rand>'
                    // Buscar cobrança salva (opcional: salvar txid <-> user no banco ao gerar cobrança)
                    // Aqui, busca no histórico de cobranças recentes
                    const users = require('./auth').readUsers();
                    let foundUser = null;
                    let valorPago = Number(pix.valor);
                    // Busca usuário que tenha solicitado cobrança com esse txid
                    // (opcional: salvar txid no user ao gerar cobrança para mapear)
                    // Aqui, busca por txid recente
                    for (const user of users) {
                        if (!user.cobrancas) continue;
                        const cobranca = user.cobrancas.find(c => c.txid === txid);
                        if (cobranca) {
                            foundUser = user;
                            break;
                        }
                    }
                    // Se não encontrou, pode tentar mapear por valor e data
                    if (foundUser) {
                        // Valor pago determina créditos
                        let creditos = 0;
                        if (valorPago === 10) creditos = 7;
                        if (valorPago === 45) creditos = 45;
                        if (valorPago === 80) creditos = 160;
                        foundUser.credits = (foundUser.credits || 0) + creditos;
                        require('./auth').updateUser(foundUser);
                        console.log(`✅ Créditos (${creditos}) liberados para usuário ${foundUser.username} via Pix.`);
                    } else {
                        console.warn('Usuário para txid não encontrado.');
                    }
                }
            }
        }
        res.status(200).send('ok');
    } catch (e) {
        console.error('Erro no webhook Efi Pay:', e.message);
        res.status(500).send('erro');
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
