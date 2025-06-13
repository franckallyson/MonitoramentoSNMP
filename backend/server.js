const express = require("express");
const path = require("path");
const snmp = require("net-snmp");

const app = express();
const PORT = 3000;

// --- Configuração SNMP ---
// Altere o IP e a comunidade SNMP conforme necessário
const session = snmp.createSession("192.168.1.2", "public");

// OIDs para bytes recebidos (ifHCInOctets) e enviados (ifHCOutOctets) em uma interface de 64-bit
// Estes são mais adequados para interfaces rápidas para evitar que o contador "zere" rapidamente.
const rxOIDBase = "1.3.6.1.2.1.31.1.1.1.6"; // ifHCInOctets
const txOIDBase = "1.3.6.1.2.1.31.1.1.1.10"; // ifHCOutOctets

// Armazena os valores da última leitura para calcular a taxa
let lastRx = null;
let lastTx = null;
let lastTime = null;
let lastInterface = null;
/**
 * Converte um buffer de dados para um BigInt.
 * Necessário para contadores de 64-bit do SNMP.
 * @param {Buffer} buffer O buffer a ser convertido.
 * @returns {BigInt}
 */
function bufferToBigInt(buffer) {
  let result = 0n;
  for (const byte of buffer) {
    result = (result << 8n) + BigInt(byte);
  }
  return result;
}

// --- Servir Arquivos Estáticos do Frontend ---
// O servidor Express servirá os arquivos da pasta 'frontend'.
app.use(express.static(path.join(__dirname, '../frontend')));

app.get("/interfaces", (req, res) => {
  const ifDescrOID = "1.3.6.1.2.1.2.2.1.2"; // Interface description
  const interfaces = [];

  session.subtree(ifDescrOID, (varbinds) => {
    varbinds.forEach((vb) => {
      const oidParts = vb.oid.split(".");
      const index = oidParts[oidParts.length - 1];
      interfaces.push({ index: parseInt(index), name: vb.value.toString() });
    });
  }, (error) => {
    if (error) {
      console.error("Erro ao buscar interfaces:", error);
      res.status(500).json({ error: "Erro ao buscar interfaces" });
    } else {
      res.json({ interfaces });
    }
  });
});

// --- API Endpoint para buscar dados de tráfego ---
app.get("/api/traffic", (req, res) => {
  const rxOID = `${rxOIDBase}.${req.query.interface || 1}`; // Padrão para interface 1
  const txOID = `${txOIDBase}.${req.query.interface || 1}`; // Padrão para interface 1
  const interfaceNow = req.query.interface; // Armazena a interface atual
  const refreshInterval = req.query.refreshTime || 1000

  console.log(req.query)
  session.get([rxOID, txOID], (err, varbinds) => {
    if (err) {
      console.error("Erro no SNMP:", err);
      return res.status(500).json({ error: "Falha ao consultar o dispositivo SNMP.", details: err.toString() });
    }
    
    // Verifica se algum dos OIDs retornou erro (ex: não existe no dispositivo)
    for (const varbind of varbinds) {
        if (snmp.isVarbindError(varbind)) {
            console.error(snmp.varbindError(varbind));
            return res.status(500).json({ error: `Erro no OID: ${varbind.oid}`, details: snmp.varbindError(varbind) });
        }
    }

    const now = Date.now();
    const rxNow = bufferToBigInt(varbinds[0].value);
    const txNow = bufferToBigInt(varbinds[1].value);
    
    // Se já temos uma leitura anterior, podemos calcular a taxa
    if (lastRx !== null && lastTx !== null && lastTime !== null && lastInterface === interfaceNow) {
      const deltaTime = (now - lastTime) / refreshInterval ; // Delta de tempo em segundos
      const unidade = (req.query.unidade || "mbps").toLowerCase();
      // Evita divisão por zero se o intervalo for muito curto
      if (deltaTime === 0) {
          return res.json({ message: "Intervalo de tempo muito curto. Tentando novamente." });
      }

      const rxDelta = rxNow - lastRx;
      const txDelta = txNow - lastTx;

      const divisor = unidade === "kbps" ? 1_000 : 1_000_000;
      // Calcula a taxa em Megabits por segundo (Mbps)
      // (Bytes * 8 para obter bits) / tempo em segundos / 1_000_000 para obter Megabits
      const rxRate = (Number(rxDelta) * 8) / deltaTime / divisor / (refreshInterval/1000);
      
      const txRate = (Number(txDelta) * 8) / deltaTime / divisor / (refreshInterval/1000);
      
      // Atualiza os valores "antigos" para a próxima requisição
      lastRx = rxNow;
      lastTx = txNow;
      lastTime = now;
      
      res.json({
        unidade,
        rxRate: rxRate.toFixed(2),
        txRate: txRate.toFixed(2),
        timestamp: new Date(now).toLocaleTimeString(),
      });

    } else {
      // É a primeira requisição, então apenas armazenamos os valores
      lastRx = rxNow;
      lastTx = txNow;
      lastTime = now;
      lastInterface = interfaceNow; // Armazena a interface atual para futuras comparações
      res.json({ message: "Coleta inicial de dados realizada. As taxas serão exibidas na próxima atualização." });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando! Acesse o dashboard em http://localhost:${PORT}`);
});
