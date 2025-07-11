const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

function exportToCSV(data, filename = 'contatos.csv') {
    const fields = [
        'nome', 'telefone', 'endereco', 'categoria', 'horario', 'avaliacao', 'numAvaliacoes', 'link'
    ];
    const opts = { fields, defaultValue: '', delimiter: ';' };
    try {
        const parser = new Parser(opts);
        const csv = parser.parse(data);
        const filePath = path.join(__dirname, filename);
        fs.writeFileSync(filePath, csv);
        return filePath;
    } catch (err) {
        console.error('Erro ao exportar para CSV:', err);
        return null;
    }
}

module.exports = { exportToCSV };
