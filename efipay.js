// Integração básica com Efi Pay para gerar cobrança Pix
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const EFIPAY_CLIENT_ID = process.env.EFIPAY_CLIENT_ID;
const EFIPAY_CLIENT_SECRET = process.env.EFIPAY_CLIENT_SECRET;
const EFIPAY_CERT_PATH = process.env.EFIPAY_CERT_PATH;
const EFIPAY_CERT_PASSWORD = process.env.EFIPAY_CERT_PASSWORD;
// Ambiente sempre produção
const authBase = 'https://api.efipay.com.br';

async function getAccessToken() {
  const cert = fs.readFileSync(EFIPAY_CERT_PATH);
  const response = await axios.post(
    authBase + '/oauth/token',
    'grant_type=client_credentials',
    {
      httpsAgent: new (require('https').Agent)({
        pfx: cert,
        passphrase: EFIPAY_CERT_PASSWORD,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(EFIPAY_CLIENT_ID + ':' + EFIPAY_CLIENT_SECRET).toString('base64'),
      },
    }
  );
  return response.data.access_token;
}

async function criarCobranca(valor, usuario) {
  const accessToken = await getAccessToken();
  const body = {
    calendario: { expiracao: 3600 },
    valor: { original: 123.5},
    chave: '66992637201',
    solicitacaoPagador: `Compra de créditos (${Number(valor).toFixed(2)} reais)`
  };

  const cert = fs.readFileSync(EFIPAY_CERT_PATH);
  let resp;
  try {
    resp = await axios.post(
      authBase + '/v2/cob',
      body,
      {
        httpsAgent: new (require('https').Agent)({
          pfx: cert,
          passphrase: EFIPAY_CERT_PASSWORD,
        }),
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Cobrança criada com sucesso:', resp.data);
    return resp.data;
  } catch (err) {
    if (err.response && err.response.data) {
      console.error('Erro da API EfiPay:', err.response.data);
    } else {
      console.error('Erro inesperado:', err.message);
    }
    throw new Error('Erro inesperado ao criar cobrança: ' + err.message);
  }

  if (!resp.data || !resp.data.loc || !resp.data.loc.id) {
    console.log('DEBUG EfiPay:', resp.data);
    throw new Error('Resposta inesperada da API EfiPay ao criar cobrança.');
  }
  const loc = resp.data.loc.id;
  const txid = resp.data.txid;
  const qr = await axios.get(authBase + '/v2/loc/' + loc + '/qrcode', {
    httpsAgent: new (require('https').Agent)({
      pfx: cert,
      passphrase: EFIPAY_CERT_PASSWORD,
    }),
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });
  return {
    qrCode: qr.data.qrcode,
    qrCodeImage: qr.data.imagemQrcode,
    txid,
    valor: body.valor.original,
  };
}

module.exports = { criarCobranca };
