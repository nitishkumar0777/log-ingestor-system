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
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Login form handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
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
                alert('Login failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login error: ' + error.message);
        }
    });
}

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
        console.error('Token verification failed:', error);
        logout();
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');

    // Disconnect socket if connected
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    showLoginModal();
}

function initializeApp() {
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay && currentUser) {
        userDisplay.textContent = `${currentUser.username} (${currentUser.role})`;
    }

    initializeWebSocket();
    fetchLogs();
}

// Initialize WebSocket
function initializeWebSocket() {
    if (socket) return; // Already initialized

    socket = io('http://localhost:3000', {
        auth: {
            token: authToken
        },
        transports: ['websocket', 'polling']
    });

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

    socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
    });
}

// Perform full-text search
async function performFullTextSearch() {
    const query = document.getElementById('fullTextSearch').value.trim();
    if (!query) {
        alert('Please enter a search query');
        return;
    }

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
            new Date(document.getElementById('filterEndTime').value).toISOString() : ''
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

    currentFilters = {};
    isFullTextMode = false;
    currentPage = 1;

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

// Toggle filters visibility
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

// Fetch logs from API
async function fetchLogs() {
    if (!authToken) {
        showLoginModal();
        return;
    }

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
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            console.error('Unauthorized - token expired or invalid');
            logout();
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const queryTime = Math.round(performance.now() - queryStartTime);

        // Update stats
        const queryTimeEl = document.getElementById('queryTime');
        if (queryTimeEl) {
            queryTimeEl.textContent = `${queryTime}ms`;
        }

        const cacheStatusEl = document.getElementById('cacheStatus');
        if (cacheStatusEl) {
            const isCacheHit = response.headers.get('X-Cache') === 'HIT';
            cacheStatusEl.textContent = isCacheHit ? '💾 HIT' : '❌ MISS';
        }

        if (data.success) {
            displayLogs(data.data);
        } else {
            resultsContainer.innerHTML = '<p class="no-results">Error loading logs: ' + (data.error || 'Unknown error') + '</p>';
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        resultsContainer.innerHTML = '<p class="no-results">Error connecting to server: ' + error.message + '</p>';
    }
}

// Display logs in UI - TABLE VERSION
function displayLogs(data) {
    const resultsContainer = document.getElementById('resultsContainer');
    const { logs, total, page } = data;

    const resultCountEl = document.getElementById('resultCount');
    if (resultCountEl) {
        resultCountEl.textContent = `${total} logs`;
    }

    const totalLogsEl = document.getElementById('totalLogs');
    if (totalLogsEl) {
        totalLogsEl.textContent = total;
    }

    const pageInfoEl = document.getElementById('pageInfo');
    if (pageInfoEl) {
        pageInfoEl.textContent = `Page ${page}`;
    }

    if (logs.length === 0) {
        resultsContainer.innerHTML = '<p class="no-results">No logs found. Try adjusting your filters.</p>';
        document.getElementById('prevBtn').disabled = true;
        document.getElementById('nextBtn').disabled = true;
        return;
    }

    // Create table
    resultsContainer.innerHTML = `
        <div class="table-container">
            <table class="logs-table">
                <thead>
                    <tr>
                        <th class="col-level">Level</th>
                        <th class="col-timestamp">Timestamp</th>
                        <th class="col-message">Message</th>
                        <th class="col-resource">Resource</th>
                        <th class="col-trace">Trace ID</th>
                        <th class="col-actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => createLogRow(log)).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Update pagination
    document.getElementById('prevBtn').disabled = page === 1;
    document.getElementById('nextBtn').disabled = logs.length < 50;
}

// Create log table row
function createLogRow(log) {
    const timestamp = new Date(log.timestamp);
    const formattedTime = timestamp.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    return `
        <tr class="log-row" data-log-id="${log.id}">
            <td class="col-level">
                <span class="level-badge ${log.level || 'unknown'}">${log.level || 'UNKNOWN'}</span>
            </td>
            <td class="col-timestamp" title="${log.timestamp}">
                ${formattedTime}
            </td>
            <td class="col-message">
                <div class="message-text">${escapeHtml(log.message)}</div>
            </td>
            <td class="col-resource">
                <code>${log.resourceId || '-'}</code>
            </td>
            <td class="col-trace">
                <code class="trace-id">${log.traceId || '-'}</code>
            </td>
            <td class="col-actions">
                <button class="btn-details" onclick="showLogDetails('${log.id}')">📋 Details</button>
            </td>
        </tr>
    `;
}

// Show detailed log information in modal
function showLogDetails(logId) {
    // Find the log from current results
    const logRow = document.querySelector(`[data-log-id="${logId}"]`);
    if (!logRow) return;

    // You'll need to store the full log data
    // For now, we'll create a simple details view
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content log-details-modal">
            <div class="modal-header">
                <h3>📋 Log Details</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="detail-section">
                    <h4>Basic Information</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Level:</span>
                            <span class="detail-value">${logRow.querySelector('.level-badge').textContent}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Timestamp:</span>
                            <span class="detail-value">${logRow.querySelector('.col-timestamp').textContent}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Resource ID:</span>
                            <span class="detail-value">${logRow.querySelector('.col-resource').textContent}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Trace ID:</span>
                            <span class="detail-value">${logRow.querySelector('.col-trace').textContent}</span>
                        </div>
                    </div>
                </div>
                <div class="detail-section">
                    <h4>Message</h4>
                    <pre class="log-message-full">${logRow.querySelector('.message-text').textContent}</pre>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
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

// Real-time toggle
function toggleRealtime() {
    if (!socket || !socket.connected) {
        alert('WebSocket not connected. Please refresh the page.');
        return;
    }

    realtimeEnabled = !realtimeEnabled;
    const btn = document.getElementById('realtimeBtn');

    if (realtimeEnabled) {
        btn.textContent = '🔴 Stop Real-Time';
        btn.classList.add('active');
        socket.emit('subscribe', currentFilters);
        console.log("Subscribe event emitted");
    } else {
        btn.textContent = '▶️ Start Real-Time';
        btn.classList.remove('active');
        socket.emit('unsubscribe');
    }
}

// Prepend new logs to table (for real-time updates)
function prependNewLogs(newLogs) {
    const resultsContainer = document.getElementById('resultsContainer');
    const tableBody = resultsContainer.querySelector('.logs-table tbody');

    if (!tableBody) {
        console.error('Table body not found. Cannot prepend logs.');
        return;
    }

    newLogs.reverse().forEach(log => {
        const logRow = createLogRow(log);
        tableBody.insertAdjacentHTML('afterbegin', logRow);

        // Add flash animation
        const firstRow = tableBody.firstElementChild;
        if (firstRow) {
            firstRow.style.animation = 'flash 1s ease-in-out';
        }
    });

    // Update count
    const resultCountEl = document.getElementById('resultCount');
    if (resultCountEl) {
        const currentCount = parseInt(resultCountEl.textContent) || 0;
        resultCountEl.textContent = `${currentCount + newLogs.length} logs`;
    }

    const totalLogsEl = document.getElementById('totalLogs');
    if (totalLogsEl) {
        const currentTotal = parseInt(totalLogsEl.textContent) || 0;
        totalLogsEl.textContent = currentTotal + newLogs.length;
    }
}

// Export to CSV - FIXED VERSION
// function exportResults() {
//     const tableRows = document.querySelectorAll('.logs-table tbody tr');

//     if (tableRows.length === 0) {
//         alert('No results to export');
//         return;
//     }

//     const logs = Array.from(tableRows).map(row => {
//         return {
//             level: row.querySelector('.level-badge')?.textContent.trim() || '',
//             timestamp: row.querySelector('.col-timestamp')?.textContent.trim() || '',
//             message: row.querySelector('.message-text')?.textContent.trim() || '',
//             resourceId: row.querySelector('.col-resource code')?.textContent.trim() || '',
//             traceId: row.querySelector('.col-trace code')?.textContent.trim() || ''
//         };
//     });

//     // Convert to CSV
//     const csv = [
//         ['Level', 'Timestamp', 'Message', 'Resource ID', 'Trace ID'].join(','),
//         ...logs.map(log => [
//             log.level,
//             log.timestamp,
//             `"${log.message.replace(/"/g, '""')}"`, // Escape quotes in message
//             log.resourceId,
//             log.traceId
//         ].join(','))
//     ].join('\n');

//     // Download
//     const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement('a');
//     a.href = url;
//     a.download = `logs-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
//     document.body.appendChild(a); // Required for Firefox
//     a.click();
//     document.body.removeChild(a);
//     URL.revokeObjectURL(url);
// }

function exportResults() {
    const tableRows = document.querySelectorAll('.logs-table tbody tr');

    if (tableRows.length === 0) {
        alert('No results to export');
        return;
    }

    const logs = Array.from(tableRows).map(row => {

        // ORIGINAL: "Sep 15, 2023, 13:30:00"
        const rawTimestamp = row.querySelector('.col-timestamp')?.textContent.trim() || '';

        // Convert using Date()
        const dt = new Date(rawTimestamp);

        const pad = n => n.toString().padStart(2, '0');

        const timestamp = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;

        return {
            level: row.querySelector('.level-badge')?.textContent.trim() || '',
            timestamp,
            message: row.querySelector('.message-text')?.textContent.trim() || '',
            resourceId: row.querySelector('.col-resource code')?.textContent.trim() || '',
            traceId: row.querySelector('.col-trace code')?.textContent.trim() || ''
        };
    });


    const csv = [
        ['Level', 'Timestamp', 'Message', 'Resource ID', 'Trace ID'].join(','),
        ...logs.map(log => [
            log.level,
            log.timestamp,
            `"${log.message.replace(/"/g, '""')}"`,
            log.resourceId,
            log.traceId
        ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}




function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        performFullTextSearch();
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}