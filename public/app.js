// ========== 全局状态 ==========
let currentType = 'lost';
let currentMatchId = null;
let allItems = { lost: [], found: [] };
let allMatches = [];

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  initTypeToggle();
  initForm();
  initTabs();
  initImageUpload();
  loadAllData();

  // 每30秒自动刷新数据
  setInterval(loadAllData, 30000);
});

// ========== 类型切换 ==========
function initTypeToggle() {
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
    });
  });
}

// ========== 表单提交 ==========
function initForm() {
  const form = document.getElementById('submitForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('type', currentType);
    formData.append('description', document.getElementById('description').value);
    formData.append('contact', document.getElementById('contact').value);
    formData.append('submitter', document.getElementById('submitter').value);

    const imageInput = document.getElementById('image');
    if (imageInput.files[0]) {
      formData.append('image', imageInput.files[0]);
    }

    try {
      showToast('🤖 AI 正在分析...', 'info');

      const response = await fetch('/api/items', { method: 'POST', body: formData });
      const result = await response.json();

      if (result.success) {
        // 显示AI分析结果
        showAIAnalysis(result.features);

        // 显示匹配结果
        if (result.matches && result.matches.length > 0) {
          showMatchResults(result.matches);
          showToast(`🎯 发现 ${result.matches.length} 个可能匹配！`, 'success');
        } else {
          hideMatchResults();
          showToast('✅ 发布成功！暂无匹配，有新信息时会自动通知', 'info');
        }

        // 重置表单
        form.reset();
        document.getElementById('imagePreview').style.display = 'none';
        document.querySelector('.upload-placeholder').style.display = 'block';

        // 刷新所有数据
        await loadAllData();

        // 滚动到分析结果
        setTimeout(() => {
          document.getElementById('aiAnalysis')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      } else {
        showToast('❌ 提交失败：' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('提交失败:', error);
      showToast('❌ 网络错误，请重试', 'error');
    }
  });
}

// ========== 图片上传预览 ==========
function initImageUpload() {
  const uploadArea = document.getElementById('uploadArea');
  const imageInput = document.getElementById('image');
  const preview = document.getElementById('imagePreview');
  const placeholder = document.querySelector('.upload-placeholder');

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    uploadArea.style.background = '#f8f9ff';
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#d0d0d0';
    uploadArea.style.background = 'white';
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#d0d0d0';
    uploadArea.style.background = 'white';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      imageInput.files = e.dataTransfer.files;
      imageInput.dispatchEvent(new Event('change'));
    }
  });
}

// ========== 数据加载 ==========
async function loadAllData() {
  try {
    const [itemsRes, matchesRes] = await Promise.all([
      fetch('/api/items'),
      fetch('/api/matches')
    ]);

    const itemsData = await itemsRes.json();
    const matchesData = await matchesRes.json();

    allItems.lost = itemsData.items.filter(i => i.type === 'lost');
    allItems.found = itemsData.items.filter(i => i.type === 'found');
    allMatches = matchesData.matches || [];

    // 更新统计
    document.getElementById('statTotal').textContent = `共 ${itemsData.total || 0} 条信息`;
    document.getElementById('statMatches').textContent = `🔗 ${allMatches.length} 组匹配`;
    document.getElementById('lostCount').textContent = allItems.lost.length;
    document.getElementById('foundCount').textContent = allItems.found.length;
    document.getElementById('matchTabCount').textContent = allMatches.length;

    // 渲染列表
    renderItems('lostItems', allItems.lost, 'lost');
    renderItems('foundItems', allItems.found, 'found');
    renderMatchRecords(allMatches);

  } catch (error) {
    console.error('加载数据失败:', error);
  }
}

// ========== 渲染物品列表 ==========
function renderItems(containerId, items, type) {
  const container = document.getElementById(containerId);

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">${type === 'lost' ? '🔍' : '🎁'}</div>
        <p>暂无${type === 'lost' ? '失物' : '拾物'}信息</p>
        <p style="font-size:0.9em;margin-top:8px;">成为第一个发布者吧！</p>
      </div>`;
    return;
  }

  let html = '';
  items.forEach(item => {
    // 检查该物品是否有匹配
    const hasMatch = allMatches.some(m =>
      m.lostItemId === item.id || m.foundItemId === item.id
    );

    html += `
      <div class="item-card ${hasMatch ? 'has-match' : ''}">
        ${hasMatch ? '<span class="match-indicator">🔗 已匹配</span>' : ''}
        <div class="item-image">
          ${item.image ? `<img src="${item.image}" alt="物品图片">` : (type === 'lost' ? '❓' : '🎁')}
        </div>
        <div class="item-info">
          <span class="item-type-badge ${item.type}">${item.type === 'lost' ? '寻物' : '拾物'}</span>
          <div class="item-description" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</div>
          <div class="item-features">
            ${item.features?.type ? `<span class="feature-tag type">${item.features.type}</span>` : ''}
            ${item.features?.brand ? `<span class="feature-tag brand">${item.features.brand}</span>` : ''}
            ${(item.features?.colors || []).map(c => `<span class="feature-tag color">${c}</span>`).join('')}
            ${item.features?.location ? `<span class="feature-tag location">📍${item.features.location}</span>` : ''}
          </div>
          <div class="item-meta">
            <span>👤 ${escapeHtml(item.submitter)}</span>
            <span>⏰ ${getTimeAgo(item.createdAt)}</span>
            ${item.contact ? `<span>📞 ${escapeHtml(item.contact)}</span>` : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="ai-match-btn" onclick="runItemMatch('${item.id}', this)">
            🤖 AI匹配
          </button>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

// ========== 渲染匹配记录列表 ==========
function renderMatchRecords(matches) {
  const container = document.getElementById('matchRecords');
  const filterLevel = document.getElementById('matchLevelFilter')?.value || 'all';

  let filtered = matches;
  if (filterLevel !== 'all') {
    filtered = matches.filter(m => m.matchLevel === filterLevel);
  }

  if (!filtered || filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🔗</div>
        <p>暂无匹配记录</p>
        <p style="font-size:0.9em;margin-top:8px;">发布信息后AI会自动匹配</p>
      </div>`;
    return;
  }

  let html = '';
  filtered.forEach(match => {
    const lostItem = allItems.lost.find(i => i.id === match.lostItemId);
    const foundItem = allItems.found.find(i => i.id === match.foundItemId);

    if (!lostItem || !foundItem) return;

    const levelClass = match.matchLevel || 'low';
    const levelText = { high: '高度匹配', medium: '可能匹配', low: '弱相关' };

    html += `
      <div class="match-record">
        <div class="match-record-header">
          <div>
            <span class="match-level-badge ${levelClass}">${levelText[levelClass] || '未知'}</span>
            <span class="match-record-score ${levelClass}">${match.score}分</span>
          </div>
          <div class="match-actions">
            <button class="btn-match primary" onclick="openVerifyModal('${match.id}')">🔐 验证身份</button>
            <button class="btn-match secondary" onclick="showMatchDetail('${match.id}')">📋 详情</button>
          </div>
        </div>

        <div class="match-details">
          <ul>${(match.details || []).map(d => `<li>${d}</li>`).join('')}</ul>
        </div>

        <div class="match-record-bodies">
          <div class="match-record-body">
            <div class="match-record-body-label">😢 失物信息</div>
            <div style="font-size:0.9em;color:#444;line-height:1.5;">${escapeHtml(lostItem.description.slice(0, 100))}${lostItem.description.length > 100 ? '...' : ''}</div>
            <div style="font-size:0.82em;color:#888;margin-top:6px;">👤 ${escapeHtml(lostItem.submitter)} · ⏰ ${getTimeAgo(lostItem.createdAt)}</div>
          </div>
          <div class="match-record-body">
            <div class="match-record-body-label">🎉 拾物信息</div>
            <div style="font-size:0.9em;color:#444;line-height:1.5;">${escapeHtml(foundItem.description.slice(0, 100))}${foundItem.description.length > 100 ? '...' : ''}</div>
            <div style="font-size:0.82em;color:#888;margin-top:6px;">👤 ${escapeHtml(foundItem.submitter)} · ⏰ ${getTimeAgo(foundItem.createdAt)}</div>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

// ========== AI 匹配功能 ==========

// 对单个物品运行AI匹配
async function runItemMatch(itemId, btnElement) {
  if (btnElement) {
    btnElement.textContent = '⏳ 匹配中...';
    btnElement.classList.add('loading');
  }

  try {
    const response = await fetch(`/api/items/${itemId}/match`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showToast(`🤖 匹配完成！发现 ${result.matches.length} 个相关结果`, 'success');

      // 切换到匹配记录标签页
      if (result.matches.length > 0) {
        showMatchResults(result.matches);
        switchTab('match-list');
      }

      // 刷新数据
      await loadAllData();
    } else {
      showToast('❌ 匹配失败', 'error');
    }
  } catch (error) {
    console.error('匹配失败:', error);
    showToast('❌ 网络错误', 'error');
  } finally {
    if (btnElement) {
      btnElement.textContent = '🤖 AI匹配';
      btnElement.classList.remove('loading');
    }
  }
}

// 全局重新匹配
async function runGlobalMatch() {
  showToast('🔄 正在全局AI重新匹配...', 'info');

  try {
    // 对所有物品依次触发匹配（实际生产中应该用批量API）
    const allIds = [...allItems.lost, ...allItems.found].map(i => i.id);
    let totalMatches = 0;

    for (const id of allIds) {
      try {
        const res = await fetch(`/api/items/${id}/match`, { method: 'POST' });
        const data = await res.json();
        if (data.success && data.newMatches) {
          totalMatches += data.newMatches.length;
        }
      } catch (e) { /* 继续处理下一个 */ }
    }

    await loadAllData();
    showToast(`✅ 全局匹配完成！共 ${allMatches.length} 组匹配（新增 ${totalMatches} 组）`, 'success');

    // 如果有新匹配，自动切换到匹配记录页
    if (totalMatches > 0) {
      switchTab('match-list');
    }
  } catch (error) {
    console.error('全局匹配失败:', error);
    showToast('❌ 全局匹配失败', 'error');
  }
}

// ========== 显示AI分析结果 ==========
function showAIAnalysis(features) {
  const analysisDiv = document.getElementById('aiAnalysis');
  const contentDiv = document.getElementById('analysisContent');

  let html = '<div class="feature-tags">';
  if (features.type) html += `<span class="feature-tag type">📦 类型：${features.type}</span>`;
  if (features.brand) html += `<span class="feature-tag brand">🏷️ 品牌：${features.brand}</span>`;
  features.colors?.forEach(color => {
    html += `<span class="feature-tag color">🎨 颜色：${color}</span>`;
  });
  if (features.location) html += `<span class="feature-tag location">📍 地点：${features.location}</span>`;
  html += '</div>';

  if (features.characteristics?.length > 0) {
    html += `<p style="margin-top:12px;color:#555;"><strong>特殊特征：</strong>${features.characteristics.join('、')}</p>`;
  }
  if (features.keywords?.length > 0) {
    html += `<p style="margin-top:8px;color:#888;font-size:0.9em;"><strong>提取关键词：</strong>${features.keywords.slice(0, 10).join('、')}</p>`;
  }

  contentDiv.innerHTML = html;
  analysisDiv.style.display = 'block';
}

// ========== 显示匹配结果 ==========
function showMatchResults(matches) {
  const section = document.getElementById('matchSection');
  const listDiv = document.getElementById('matchList');
  const countSpan = document.getElementById('matchCount');

  if (!matches || matches.length === 0) {
    hideMatchResults();
    return;
  }

  countSpan.textContent = `${matches.length} 个`;

  let html = '';
  matches.forEach(match => {
    const levelClass = match.matchLevel || 'medium';
    const confidenceText = match.confidence || '可能匹配';

    html += `
      <div class="match-card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span class="match-level-badge ${levelClass}">${confidenceText}</span>
          <span class="match-score-big">${match.score}</span>
          <span style="color:#888;font-size:0.9em;">/ 100分</span>
        </div>
        <div class="match-details">
          <ul>${(match.details || []).map(d => `<li>${d}</li>`).join('')}</ul>
        </div>
        <div class="match-actions">
          <button class="btn-match primary" onclick="openVerifyModal('${match.id}')">🔐 开始验证</button>
          <button class="btn-match secondary" onclick="showMatchDetail('${match.id}')">查看详情</button>
        </div>
      </div>`;
  });

  listDiv.innerHTML = html;
  section.style.display = 'block';
}

function hideMatchResults() {
  document.getElementById('matchSection').style.display = 'none';
}

// ========== 标签页切换 ==========
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');

  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
}

// ========== 搜索/过滤 ==========
function filterItems() {
  const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
  // 简单实现：刷新数据后由前端过滤
  loadAllData().then(() => {
    if (keyword) {
      ['lostItems', 'foundItems'].forEach(containerId => {
        const cards = document.querySelectorAll(`#${containerId} .item-card`);
        cards.forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(keyword) ? '' : 'none';
        });
      });
    }
  });
}

function filterMatches() {
  renderMatchRecords(allMatches);
}

// ========== 验证弹窗 ==========
function openVerifyModal(matchId) {
  currentMatchId = matchId;

  fetch('/api/matches')
    .then(res => res.json())
    .then(data => {
      const match = data.matches.find(m => m.id === matchId);
      if (match) {
        const questionsDiv = document.getElementById('verifyQuestions');
        let html = '';
        (match.verificationQuestions || []).forEach((q, idx) => {
          html += `
            <div class="question-item">
              <label>${idx + 1}. ${q.question}</label>
              ${q.hint ? `<div style="font-size:0.85em;color:#888;margin-bottom:6px;">${q.hint}</div>` : ''}
              <input type="text" id="answer${idx}" placeholder="请输入你的答案...">
            </div>`;
        });
        questionsDiv.innerHTML = html;
        document.getElementById('verifyModal').style.display = 'flex';
      }
    });
}

function closeVerifyModal() {
  document.getElementById('verifyModal').style.display = 'none';
  currentMatchId = null;
}

async function submitVerification() {
  if (!currentMatchId) return;

  const questionInputs = document.querySelectorAll('#verifyQuestions .question-item input');
  const answers = Array.from(questionInputs).map(input => input.value);

  if (answers.some(a => !a.trim())) {
    showToast('⚠️ 请回答所有问题', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/matches/${currentMatchId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });

    const result = await response.json();
    showToast(result.message, result.passed ? 'success' : 'error');
    closeVerifyModal();
    await loadAllData();
  } catch (error) {
    console.error('验证失败:', error);
    showToast('❌ 验证请求失败', 'error');
  }
}

// ========== 匹配详情弹窗 ==========
function showMatchDetail(matchId) {
  const match = allMatches.find(m => m.id === matchId);
  if (!match) return;

  const lostItem = allItems.lost.find(i => i.id === match.lostItemId);
  const foundItem = allItems.found.find(i => i.id === match.foundItemId);

  document.getElementById('matchDetailTitle').textContent =
    `匹配详情 - ${match.confidence || '未知等级'} (${match.score}分)`;

  document.getElementById('matchDetailContent').innerHTML = `
    <div style="margin-bottom:20px;">
      <h4 style="color:#555;margin-bottom:10px;">📊 匹配依据</h4>
      <ul style="color:#666;line-height:2;">
        ${(match.details || []).map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#fff3e0;padding:16px;border-radius:10px;">
        <h4 style="color:#e65100;margin-bottom:10px;">😢 失物详情</h4>
        ${lostItem ? `
          <p style="color:#444;line-height:1.7;font-size:0.93em;">${escapeHtml(lostItem.description)}</p>
          <div style="margin-top:10px;font-size:0.85em;color:#888;">
            👤 ${escapeHtml(lostItem.submitter)}<br>
            ⏰ ${new Date(lostItem.createdAt).toLocaleString('zh-CN')}<br>
            ${lostItem.contact ? `📞 ${escapeHtml(lostItem.contact)}` : ''}
          </div>
          ${lostItem.image ? `<img src="${lostItem.image}" style="max-width:100%;max-height:150px;border-radius:8px;margin-top:10px;" alt="失物图片">` : ''}
        ` : '<p style="color:#999;">失物信息不存在</p>'}
      </div>

      <div style="background:#e8f5e9;padding:16px;border-radius:10px;">
        <h4 style="color:#2e7d32;margin-bottom:10px;">🎉 拾物详情</h4>
        ${foundItem ? `
          <p style="color:#444;line-height:1.7;font-size:0.93em;">${escapeHtml(foundItem.description)}</p>
          <div style="margin-top:10px;font-size:0.85em;color:#888;">
            👤 ${escapeHtml(foundItem.submitter)}<br>
            ⏰ ${new Date(foundItem.createdAt).toLocaleString('zh-CN')}<br>
            ${foundItem.contact ? `📞 ${escapeHtml(foundItem.contact)}` : ''}
          </div>
          ${foundItem.image ? `<img src="${foundItem.image}" style="max-width:100%;max-height:150px;border-radius:8px;margin-top:10px;" alt="拾物图片">` : ''}
        ` : '<p style="color:#999;">拾物信息不存在</p>'}
      </div>
    </div>

    <div style="margin-top:20px;text-align:center;">
      <button class="btn-match primary" onclick="closeMatchDetail();openVerifyModal('${matchId}')">
        🔐 进行身份验证
      </button>
    </div>
  `;

  document.getElementById('matchDetailModal').style.display = 'flex';
}

function closeMatchDetail() {
  document.getElementById('matchDetailModal').style.display = 'none';
}

// ========== Toast 提示 ==========
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';

  // 根据类型设置颜色
  const colors = {
    info: '#2196f3',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336'
  };
  toast.style.background = colors[type] || colors.info;

  // 3秒后自动消失
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ========== 工具函数 ==========
function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
