
window.onload = function () {
    loadInterfaces();
    let indexInterface = 1; // Padrão para ether1, pode ser alterado conforme necessário
    const ctx = document.getElementById('realtimeChart').getContext('2d');
    const errorMessageElement = document.getElementById('error-message');
    const detailedDataContainer = document.getElementById('detailed-snmp-data');
    let currentUnit = 'Mbps';
    const unitSelector = document.getElementById('unit');
    // --- Configurações ---
    const MAX_DATA_POINTS = 30; // Mostrar os últimos 60 pontos (5 minutos se o intervalo for 5s)
    let FETCH_INTERVAL_MS = 2000; // Buscar dados a cada 2 segundo
    let fetchIntervalId;

    const refreshSelector = document.getElementById('refresh-interval');

    refreshSelector.addEventListener('change', () => {
        FETCH_INTERVAL_MS = parseInt(refreshSelector.value);
        clearInterval(fetchIntervalId);
        
        fetchIntervalId =setInterval(fetchDataAndUpdateUI, FETCH_INTERVAL_MS);
    });
    
    // --- Inicialização do Gráfico ---
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Rótulos de tempo no eixo X
            datasets: [
                {
                    label: 'Rx (Mbps)',
                    data: [],
                    borderColor: 'rgba(0, 123, 255, 1)',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                },
                {
                    label: 'Tx (Mbps)',
                    data: [],
                    borderColor: 'rgba(40, 167, 69, 1)',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Taxa (Mbps)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Tempo'
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }
            },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            animation: {
                duration: 1000 // Animação suave na atualização
            }
        }
    });

    unitSelector.addEventListener('change', () => {
        currentUnit = unitSelector.value == 'mbps' ? 'Mbps' : 'Kbps';
        
        console.log("Unidade selecionada:", currentUnit, unitSelector.value);
        chart.options.scales.y.title.text = `Taxa (${currentUnit})`;
        chart.data.datasets[0].label = `Rx (${currentUnit})`;
        chart.data.datasets[1].label = `Tx (${currentUnit})`;
        chart.update();
    });

    /**
     * Busca dados da API e atualiza a interface do usuário (gráfico e detalhes).
     */
    async function fetchDataAndUpdateUI() {
        try {
            
            // A rota foi ajustada para /api/traffic
            const response = await fetch(`/api/traffic?unidade=${currentUnit.toLowerCase()}&interface=${indexInterface}`);
           
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro HTTP ${response.status}`);
            }

            const data = await response.json();
            errorMessageElement.style.display = 'none';

            // Se for a mensagem inicial, apenas exibe e não atualiza o gráfico
            if (data.message) {
                detailedDataContainer.innerHTML = `<p>${data.message}</p>`;
                return;
            }

            // 1. Adiciona os novos dados ao gráfico
            const newLabel = data.timestamp || new Date().toLocaleTimeString();
            
            chart.data.labels.push(newLabel);
            chart.data.datasets[0].data.push(parseFloat(data.rxRate)); // Download
            chart.data.datasets[1].data.push(parseFloat(data.txRate)); // Upload

            // 2. Remove o ponto de dado mais antigo se exceder o limite
            /* if (chart.data.labels.length > MAX_DATA_POINTS) {
                chart.data.labels.shift();
                chart.data.datasets.forEach(dataset => {
                    dataset.data.shift();
                });
            } */

            // 3. Atualiza o gráfico na tela
            chart.update();
            unit = data.unidade == 'kbps' ? 'Kbps' : 'Mbps'; // Atualiza a unidade se fornecida
            
            
            // 4. Atualiza o painel de informações detalhadas
            detailedDataContainer.innerHTML = `
                <p>
                    <strong>Download (RX)</strong>
                    <span id="rx-value" class="data-value">${data.rxRate} ${unit}</span>
                </p>
                <p>
                    <strong>Upload (TX)</strong>
                    <span id="tx-value" class="data-value">${data.txRate} ${unit}</span>
                </p>
                <p id="timestamp">Atualizado em: ${newLabel}</p>
            `;

        } catch (error) {
            console.error("Falha ao buscar ou atualizar UI:", error);
            errorMessageElement.textContent = `Erro ao carregar dados: ${error.message}. Verifique o console do navegador e do backend.`;
            errorMessageElement.style.display = 'block';
        }
    }

    // Chama a função uma vez para carregar os dados iniciais e depois a cada X segundos.
    fetchDataAndUpdateUI();
    fetchIntervalId = setInterval(fetchDataAndUpdateUI, FETCH_INTERVAL_MS);

    const interfaceSelector = document.getElementById('interface-selector');
    
    // Carrega interfaces disponíveis
    async function loadInterfaces() {
        try {
            const res = await fetch('/interfaces');
            const data = await res.json();
            interfaceSelector.innerHTML = ''; // Limpa opções anteriores

            data.interfaces.forEach(iface => {
                const option = document.createElement('option');
                option.value = iface.index;
                option.textContent = iface.name;
                interfaceSelector.appendChild(option);
            });
            
            // Define interface padrão
            indexInterface = parseInt(interfaceSelector.value || data.interfaces[0].index);
            console.log("Interface padrão selecionada:", indexInterface);
        } catch (err) {
            console.error("Erro ao carregar interfaces:", err);
            interfaceSelector.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }

    // Listener para mudança de interface
    interfaceSelector.addEventListener('change', () => {
        const newIndex = parseInt(interfaceSelector.value);
        if (!isNaN(newIndex)) {
            indexInterface = newIndex;
            console.log("Interface selecionada:", newIndex);
            // Limpa o gráfico
            chart.data.labels = [];
            chart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });

            chart.update();
        }
    });
};
