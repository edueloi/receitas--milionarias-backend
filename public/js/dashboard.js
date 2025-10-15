/* =========================================================
   PAINEL FINANCEIRO - LÓGICA DO FRONTEND (REATORADO)
   ========================================================= */

// ===============================
// 🧠 ESTADO E CONFIGURAÇÃO
// ===============================

// Objeto central que guarda o estado da aplicação
const state = {
  data: null, // Armazena os dados processados da API
  currentUser: "admin", // 'admin' ou o ID de um cliente
  currentRange: "7d",   // Período de tempo selecionado
  isLoading: false,     // Flag para controlar o estado de carregamento
};

// Mapeamento dos elementos do DOM para acesso fácil
const UI = {
  rangeSelect: document.getElementById("rangeSelect"),
  userSelect: document.getElementById("userSelect"),
  adminSections: [
    document.getElementById("admin-overview-section"),
    document.getElementById("affiliates-table-section"),
    document.getElementById("payouts-table-section"),
  ],
  userSummarySection: document.getElementById("user-summary-section"),
  allTables: document.querySelectorAll(".table-container"),
};

// ===============================
// ⚙️ FUNÇÕES AUXILIARES (HELPERS)
// ===============================

const formatCurrency = (value) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (timestamp) => timestamp ? new Date(timestamp * 1000).toLocaleDateString("pt-BR") : "—";
const toStatusClass = (status) => String(status).toLowerCase().replace(/ /g, '-');

/** Ativa/Desativa o estado de carregamento na UI */
function setLoading(isLoading) {
  state.isLoading = isLoading;
  document.body.style.cursor = isLoading ? "wait" : "default";
  UI.rangeSelect.disabled = isLoading;
  UI.userSelect.disabled = isLoading;
}

// ===============================
// 🔄 PRÉ-PROCESSAMENTO DE DADOS
// ===============================

/**
 * Processa os dados brutos da API uma vez para otimizar o acesso.
 * Cria mapas para buscas rápidas.
 */
function processData(rawData) {
  // Mapa para encontrar clientes por ID rapidamente
  const customersById = new Map(rawData.customers.map(c => [c.id, c]));

  // Adiciona informações de cliente e data de próximo pagamento aos vencimentos
  rawData.proximosVencimentos.forEach(v => {
    const subscription = rawData.subscriptions.find(sub => sub.id === v.id);
    v.nextPaymentDate = subscription?.items.data[0].current_period_end;
    const customer = customersById.get(v.customerId);
    v.customerName = customer?.name || v.customerName;
    v.customerEmail = customer?.email || v.customerEmail;
  });
  
  return rawData;
}


// ===============================
// 🎨 FUNÇÕES DE RENDERIZAÇÃO (UI)
// ===============================

function renderAdminCards(data) {
  document.getElementById("totalBruto").textContent = formatCurrency(data.total.bruto);
  document.getElementById("totalTarifa").textContent = formatCurrency(data.total.tarifa);
  document.getElementById("totalLiquido").textContent = formatCurrency(data.total.liquido);
  document.getElementById("totalTransferencias").textContent = formatCurrency(data.totalTransferencias);
  document.getElementById("saldoDisponivel").textContent = formatCurrency(data.balance.availableBrl);
  document.getElementById("saldoPendente").textContent = formatCurrency(data.balance.pendingBrl);
  document.getElementById("totalClientes").textContent = data.totalClientes;
  document.getElementById("totalAssinaturas").textContent = data.totalAssinaturas;
}

function renderTable(tableId, items, rowTemplate) {
  const tableBody = document.getElementById(tableId);
  if (tableBody) tableBody.innerHTML = items.map(rowTemplate).join("");
}

function renderUserFilter(customers) {
  const selectedValue = UI.userSelect.value;
  UI.userSelect.innerHTML = '<option value="admin">👑 Visão de Admin</option>';
  customers
    .filter(c => c.email)
    .forEach(c => {
      const option = document.createElement("option");
      option.value = c.id; // Usar o ID como valor é mais seguro
      option.textContent = `${c.name} (${c.email})`;
      UI.userSelect.appendChild(option);
    });
  UI.userSelect.value = selectedValue;
}

function renderUserSummary(customer, data) {
    const totalPaid = data.pagamentos
        .filter(p => p.customerId === customer.id)
        .reduce((sum, p) => sum + p.amount, 0);

    const subscriptionsCount = data.subscriptions.filter(s => s.customer === customer.id).length;

    UI.userSummarySection.innerHTML = `
    <div class="user-resumo">
        <h2><i class="fa-solid fa-user-circle"></i> Resumo de ${customer.name}</h2>
        <div class="info-grid">
            <div class="info-item"><span class="label">Email</span><span class="value">${customer.email}</span></div>
            <div class="info-item"><span class="label">Status</span><span class="value"><span class="status status-${toStatusClass(customer.status)}">${customer.status}</span></span></div>
            <div class="info-item"><span class="label">Total de Assinaturas</span><span class="value">${subscriptionsCount}</span></div>
            <div class="info-item"><span class="label">Total Gasto</span><span class="value">${formatCurrency(totalPaid)}</span></div>
        </div>
    </div>`;
}


// ===============================
// 🎬 LÓGICA DE EXIBIÇÃO
// ===============================

function displayView() {
  const { data, currentUser } = state;
  if (!data) return;

  const isAdminView = currentUser === "admin";
  
  // Alterna a visibilidade das seções principais
  UI.adminSections.forEach(sec => sec.classList.toggle('hidden', !isAdminView));
  UI.userSummarySection.classList.toggle('hidden', isAdminView);

  if (isAdminView) {
    UI.allTables.forEach(table => table.classList.remove('hidden'));
    renderAdminCards(data);
    
    // Renderiza todas as tabelas com dados completos
    renderTable("affiliatesTable", Object.keys(data.afiliados), id => `
        <tr>
            <td><strong>${id}</strong></td>
            <td>${formatCurrency(data.ganhosPorAfiliado[id] || 0)}</td>
            <td><ul>${data.afiliados[id].map(i => `<li>${i.name}</li>`).join('')}</ul></td>
        </tr>`);
    renderTable("pagamentosTable", data.pagamentos, p => `<tr><td><strong>${p.customerName}</strong><small>${p.customerEmail}</small></td><td>${formatCurrency(p.amount)}</td><td>${formatDate(p.created)}</td><td><span class="status status-${toStatusClass(p.status)}">${p.status}</span></td><td><a href="${p.receiptUrl}" target="_blank">Ver</a></td></tr>`);
    renderTable("clientesTable", data.customers, c => `<tr><td>${c.name}</td><td>${c.email}</td><td><span class="status status-${toStatusClass(c.status)}">${c.status}</span></td></tr>`);
    renderTable("vencimentosTable", data.proximosVencimentos, v => `<tr><td><strong>${v.customerName}</strong><small>${v.customerEmail}</small></td><td>${formatDate(v.nextPaymentDate)}</td><td><small>${v.id}</small></td></tr>`);
    renderTable("repassesTable", data.proximosRepasses, r => `<tr><td><small>${r.id}</small></td><td>${formatCurrency(r.amount)}</td><td>${formatDate(r.arrival_date)}</td><td><span class="status status-${toStatusClass(r.status)}">${r.status}</span></td></tr>`);
  } else {
    // Visão de Usuário
    const customer = data.customers.find(c => c.id === currentUser);
    if (!customer) return;

    // Filtra dados apenas para o usuário selecionado
    const userPayments = data.pagamentos.filter(p => p.customerId === currentUser);

    renderUserSummary(customer, data);
    
    // Esconde todas as tabelas e mostra apenas a de pagamentos do usuário
    UI.allTables.forEach(table => table.classList.add('hidden'));
    
    if (userPayments.length > 0) {
        document.getElementById('payments-table-section').classList.remove('hidden');
        renderTable("pagamentosTable", userPayments, p => `<tr><td><strong>${p.customerName}</strong><small>${p.customerEmail}</small></td><td>${formatCurrency(p.amount)}</td><td>${formatDate(p.created)}</td><td><span class="status status-${toStatusClass(p.status)}">${p.status}</span></td><td><a href="${p.receiptUrl}" target="_blank">Ver</a></td></tr>`);
    }
  }
}

// ===============================
// 🚀 INICIALIZAÇÃO E EVENTOS
// ===============================

async function initializeDashboard() {
  setLoading(true);
  try {
    const response = await fetch(`/stripe-dashboard-data?range=${state.currentRange}`);
    if (!response.ok) throw new Error(`Erro na rede: ${response.statusText}`);
    
    const rawData = await response.json();
    state.data = processData(rawData); // Processa e armazena os dados

    renderUserFilter(state.data.customers);
    displayView();

  } catch (error) {
    console.error("❌ Falha ao inicializar o painel:", error);
    alert(`Não foi possível carregar os dados: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Evento para mudança de período
  UI.rangeSelect.addEventListener("change", (e) => {
    state.currentRange = e.target.value;
    initializeDashboard(); // Recarrega os dados para o novo período
  });

  // Evento para mudança de usuário
  UI.userSelect.addEventListener("change", (e) => {
    state.currentUser = e.target.value;
    displayView(); // Apenas atualiza a exibição, sem recarregar os dados
  });

  // Carga inicial
  initializeDashboard();
});