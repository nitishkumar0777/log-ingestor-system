let authToken = localStorage.getItem('authToken');
let currentUser = null;
let currentPage = 1;
let currentFilters = {};
let isFullTextMode = false;
let fullTextQuery = '';
let socket = null;
let realtimeEnabled = false;
let queryStartTime = 0;

// Check authentication on load
window.addEventListener('DOMContentLoaded', () => {
    if (!authToken) {
        showLoginModal();
    } else {
        verifyToken();
    }
});

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
}

function hideLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

// Login form handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            hideLoginModal();
            initializeApp();
        } else {
            alert('Login failed: ' + data.error);
        }
    } catch (error) {
        alert('Login error: ' + error.message);
    }
});

async function verifyToken() {
    try {
        const response = await fetch('/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            initializeApp();
        } else {
            logout();
        }
    } catch (error) {
        logout();
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    showLoginModal();
}

function initializeApp() {
    document.getElementById('userDisplay').textContent =
        `${currentUser.username} (${currentUser.role})`;
    initializeWebSocket();
    fetchLogs();
}

// Quick filter buttons
function quickFilter(type) {
    clearFilters();

    if (type === 'error') {
        document.getElementById('filterLevel').value = 'error';
    } else if (type === 'warn') {
        document.getElementById('filterLevel').value = 'warn';
    } else if (type === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        document.getElementById('filterStartTime').value =
            today.toISOString().slice(0, 16);
    }

    applyFilters();
}

// Toggle filter visibility
function toggleFilters() {
    const grid = document.getElementById('filterGrid');
    const toggle = document.getElementById('filterToggle');

    if (grid.style.display === 'none') {
        grid.style.display = 'grid';
        toggle.textContent = '▼';
    } else {
        grid.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// Export to CSV
function exportResults() {
    // Get current results
    const logs = Array.from(document.querySelectorAll('.log-card')).map(card => {
        return {
            level: card.querySelector('.log-level').textContent,
            timestamp: card.querySelector('.log-timestamp').textContent,
            message: card.querySelector('.log-message').textContent,
            resourceId: card.querySelector('.log-detail-value').textContent
        };
    });

    if (logs.length === 0) {
        alert('No results to export');
        return;
    }

    // Convert to CSV
    const csv = [
        ['Level', 'Timestamp', 'Message', 'Resource ID'].join(','),
        ...logs.map(log =>
            [log.level, log.timestamp, `"${log.message}"`, log.resourceId].join(',')
        )
    ].join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-export-${new Date().toISOString()}.csv`;
    a.click();
}

// Search with Enter key
function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        performFullTextSearch();
    }
}

// Fetch logs with authentication
async function fetchLogs() {
    queryStartTime = performance.now();
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = '<p class="loading">Loading logs...</p>';

    try {
        let url;
        let params = new URLSearchParams({ page: currentPage, size: 50 });

        if (isFullTextMode) {
            url = '/query/search';
            params.append('q', fullTextQuery);
        } else {
            url = '/query';
            Object.keys(currentFilters).forEach(key => {
                params.append(key, currentFilters[key]);
            });
        }

        const response = await fetch(`${url}?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const data = await response.json();
        const queryTime = Math.round(performance.now() - queryStartTime);

        // Update stats
        document.getElementById('queryTime').textContent = `${queryTime}ms`;
        document.getElementById('cacheStatus').textContent =
            response.headers.get('X-Cache') === 'HIT' ? '💾 HIT' : '❌ MISS';

        if (data.success) {
            displayLogs(data.data);
        } else {
            resultsContainer.innerHTML = '<p class="no-results">Error loading logs</p>';
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        resultsContainer.innerHTML = '<p class="no-results">Error connecting to server</p>';
    }
}

// Rest of the existing app.js code...
// (displayLogs, performFullTextSearch, applyFilters, etc.)

function initializeWebSocket() {
    socket = io('http://localhost:3000');

    socket.on('connect', () => {
        console.log('✅ WebSocket connected');
    });

    socket.on('newLogs', (logs) => {
        console.log(`📡 Received ${logs.length} new logs`);
        prependNewLogs(logs);
    });

    socket.on('disconnect', () => {
        console.log('❌ WebSocket disconnected');
    });
}

function toggleRealtime() {
    realtimeEnabled = !realtimeEnabled;
    const btn = document.getElementById('realtimeBtn');

    if (realtimeEnabled) {
        btn.textContent = '🔴 Stop Real-Time';
        btn.classList.add('active');
        socket.emit('subscribe', currentFilters);
    } else {
        btn.textContent = '▶️ Start Real-Time';
        btn.classList.remove('active');
        socket.emit('unsubscribe');
    }
}

function prependNewLogs(newLogs) {
    const resultsContainer = document.getElementById('resultsContainer');

    newLogs.reverse().forEach(log => {
        const logCard = createLogCard(log);
        resultsContainer.insertAdjacentHTML('afterbegin', logCard);

        // Add flash animation
        const firstCard = resultsContainer.firstElementChild;
        firstCard.style.animation = 'flash 1s ease-in-out';
    });

    // Update count
    const currentCount = parseInt(document.getElementById('resultCount').textContent);
    document.getElementById('resultCount').textContent = `${currentCount + newLogs.length} logs`;
}

function createLogCard(log) {
    return `
    <div class="log-card">
      <div class="log-header">
        <span class="log-level ${log.level}">${log.level}</span>
        <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
      </div>
      <div class="log-message">${escapeHtml(log.message)}</div>
      <div class="log-details">
        <div class="log-detail">
          <span class="log-detail-label">Resource:</span>
          <span class="log-detail-value">${log.resourceId || 'N/A'}</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">Trace ID:</span>
          <span class="log-detail-value">${log.traceId || 'N/A'}</span>
        </div>
      </div>
    </div>
  `;
}

// Perform full-text search
async function performFullTextSearch() {
    const query = document.getElementById('fullTextSearch').value.trim();
    if (!query) return;

    isFullTextMode = true;
    fullTextQuery = query;
    currentPage = 1;

    await fetchLogs();
}

// Apply filters
async function applyFilters() {
    isFullTextMode = false;
    currentPage = 1;

    currentFilters = {
        level: document.getElementById('filterLevel').value,
        resourceId: document.getElementById('filterResourceId').value,
        traceId: document.getElementById('filterTraceId').value,
        message: document.getElementById('filterMessage').value,
        spanId: document.getElementById('filterSpanId').value,
        commit: document.getElementById('filterCommit').value,
        startTime: document.getElementById('filterStartTime').value ?
            new Date(document.getElementById('filterStartTime').value).toISOString() : '',
        endTime: document.getElementById('filterEndTime').value ?
            new Date(document.getElementById('filterEndTime').value).toISOString() : '',
        parentResourceId: document.getElementById('filterParentResourceId').value,
    };

    // Remove empty filters
    Object.keys(currentFilters).forEach(key => {
        if (!currentFilters[key]) delete currentFilters[key];
    });

    await fetchLogs();
}

// Clear all filters
function clearFilters() {
    document.getElementById('filterLevel').value = '';
    document.getElementById('filterResourceId').value = '';
    document.getElementById('filterTraceId').value = '';
    document.getElementById('filterMessage').value = '';
    document.getElementById('filterSpanId').value = '';
    document.getElementById('filterCommit').value = '';
    document.getElementById('filterStartTime').value = '';
    document.getElementById('filterEndTime').value = '';
    document.getElementById('fullTextSearch').value = '';
    document.getElementById('filterParentResourceId').value = '';

    currentFilters = {};
    isFullTextMode = false;
    currentPage = 1;

    fetchLogs();
}

// Fetch logs from API
async function fetchLogs() {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = '<p class="loading">Loading logs...</p>';

    try {
        let url;
        let params = new URLSearchParams({ page: currentPage, size: 50 });

        if (isFullTextMode) {
            url = '/query/search';
            params.append('q', fullTextQuery);
        } else {
            url = '/query';
            Object.keys(currentFilters).forEach(key => {
                params.append(key, currentFilters[key]);
            });
        }

        const response = await fetch(`${url}?${params}`);
        const data = await response.json();
        console.log("Fetched data >>>>> ", data);
        if (data.success) {
            displayLogs(data.data);
        } else {
            resultsContainer.innerHTML = '<p class="no-results">Error loading logs</p>';
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        resultsContainer.innerHTML = '<p class="no-results">Error connecting to server</p>';
    }
}

// Display logs in UI
function displayLogs(data) {
    const resultsContainer = document.getElementById('resultsContainer');
    const { logs, total, page } = data;

    document.getElementById('resultCount').textContent = `${total} logs`;
    document.getElementById('pageInfo').textContent = `Page ${page}`;

    if (logs.length === 0) {
        resultsContainer.innerHTML = '<p class="no-results">No logs found</p>';
        document.getElementById('prevBtn').disabled = true;
        document.getElementById('nextBtn').disabled = true;
        return;
    }

    resultsContainer.innerHTML = logs.map(log => `
        <div class="log-card">
            <div class="log-header">
                <span class="log-level ${log.level}">${log.level}</span>
                <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
            </div>
            <div class="log-message">${escapeHtml(log.message)}</div>
            <div class="log-details">
                <div class="log-detail">
                    <span class="log-detail-label">Resource:</span>
                    <span class="log-detail-value">${log.resourceId || 'N/A'}</span>
                </div>
                <div class="log-detail">
                    <span class="log-detail-label">Trace ID:</span>
                    <span class="log-detail-value">${log.traceId || 'N/A'}</span>
                </div>
                <div class="log-detail">
                    <span class="log-detail-label">Span ID:</span>
                    <span class="log-detail-value">${log.spanId || 'N/A'}</span>
                </div>
                <div class="log-detail">
                    <span class="log-detail-label">Commit:</span>
                    <span class="log-detail-value">${log.commit || 'N/A'}</span>
                </div>
                ${log.metadata?.parentResourceId ? `
                <div class="log-detail">
                    <span class="log-detail-label">Parent Resource:</span>
                    <span class="log-detail-value">${log.metadata.parentResourceId}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');

    // Update pagination
    document.getElementById('prevBtn').disabled = page === 1;
    document.getElementById('nextBtn').disabled = logs.length < 50;
}

// Pagination
function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        fetchLogs();
    }
}

function nextPage() {
    currentPage++;
    fetchLogs();
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load initial logs on page load
window.addEventListener('DOMContentLoaded', () => {
    fetchLogs();
});