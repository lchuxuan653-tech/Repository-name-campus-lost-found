const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3002;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// 数据存储（内存）
let items = [];
let matches = [];

// ========== AI 匹配引擎 v2 ==========

// 同义词/别名映射表 —— 核心升级点
const SYNONYMS = {
  // 物品类型
  type: {
    '耳机': ['耳麦', 'earpods', 'airpods', '蓝牙耳机', '无线耳机', '有线耳机', '头戴式', '入耳式', '听筒'],
    '手机': ['iphone', '智能手机', '移动电话', '安卓', 'ios', '华为机', '小米机'],
    '电脑': ['笔记本', 'laptop', 'notebook', 'macbook', '台式机', '平板', 'ipad', 'tablet'],
    '钱包': ['钱夹', '皮夹', '卡包'],
    '钥匙': ['钥匙串', '门禁卡', '校园卡', '一卡通', '饭卡'],
    '水杯': ['水壶', '保温杯', '杯子', '马克杯', '茶杯', '水瓶'],
    '雨伞': ['伞', '遮阳伞', '太阳伞', '折叠伞'],
    '书包': ['背包', '双肩包', '单肩包', '手提袋', '袋子', '挎包'],
    '身份证': ['身份证件', 'id卡', '证件'],
    '学生卡': ['学生证', '校园卡', '一卡通', '饭卡', '门禁卡'],
    '手表': ['腕表', '电子表', '智能手表', '手环', 'apple watch'],
    '充电宝': ['移动电源', 'power bank', '充电器', '适配器'],
    'U盘': ['u盘', 'usb', '闪存盘', '存储盘'],
    '相机': ['照相机', '单反', '微单', 'camera', 'gopro', '运动相机'],
    '眼镜': ['墨镜', '太阳镜', '近视镜', '隐形眼镜', 'contact'],
    '帽子': ['鸭舌帽', '棒球帽', '毛线帽', 'beanie'],
    '外套': ['衣服', '上衣', '夹克', '卫衣', 'hoodie', '毛衣', 'coat'],
    '书本': ['教材', '课本', '书', '笔记', '笔记本(纸质)', '复习资料'],
  },
  // 颜色
  color: {
    '黑色': ['黑', 'black', '深色', '暗色'],
    '白色': ['白', 'white', '浅色', '米白', '乳白'],
    '红色': ['红', 'red', '酒红', '玫红', '粉红', '朱红', '橘红'],
    '蓝色': ['蓝', 'blue', '深蓝', '浅蓝', '天蓝', '藏青'],
    '绿色': ['绿', 'green', '墨绿', '草绿', '浅绿', '青色'],
    '黄色': ['黄', 'yellow', '金色', 'gold', '橙黄', '柠檬黄'],
    '粉色': ['粉', 'pink', '桃红', '浅粉', '玫瑰金'],
    '灰色': ['灰', 'grey', 'gray', '银灰', '深灰', '浅灰'],
    '棕色': ['棕', 'brown', '咖啡色', '褐色', '驼色'],
    '紫色': ['紫', 'purple', '淡紫', '深紫', '薰衣草'],
    '银色': ['银', 'silver', '金属色', '不锈钢'],
    '金色': ['金', 'gold', '土豪金', '香槟金'],
    '透明': ['透明', 'clear', '无色'],
  },
  // 品牌
  brand: {
    '苹果': ['apple', 'iphone', 'ipad', 'macbook', 'airpods', 'ios'],
    '华为': ['huawei', 'mate', 'nova', 'p系列', '荣耀', 'honor'],
    '小米': ['xiaomi', 'mi', '红米', 'redmi'],
    'OPPO': ['oppo', 'reno', 'find', 'a系列'],
    'vivo': ['vivo', 'x系列', 'iqoo', 's系列'],
    '三星': ['samsung', 'galaxy', 'note'],
    '联想': ['lenovo', 'thinkpad', '拯救者'],
    '戴尔': ['dell', 'alienware', 'xps', '灵越'],
    '索尼': ['sony', 'wh', 'wf', 'ps5', 'playstation'],
    '佳能': ['canon', 'eos', 'powershot'],
    '耐克': ['nike', '勾子', 'jordan'],
    '阿迪达斯': ['adidas', '三叶草'],
    'AirPods': ['airpods', '苹果耳机', '无线耳机(苹果)'],
  }
};

// 规范化文本：将同义词统一为标准词
function normalizeText(text, category) {
  let result = text.toLowerCase();
  const map = SYNONYMS[category];
  if (!map) return text;

  for (const [standard, aliases] of Object.entries(map)) {
    for (const alias of aliases) {
      const regex = new RegExp(alias, 'gi');
      if (regex.test(result)) {
        result = result.replace(regex, standard);
      }
    }
  }
  return result;
}

// 增强版特征提取 v2
function extractFeatures(text, imageUrl) {
  const features = {
    colors: [],
    brand: null,
    type: null,
    typeAliases: [], // 存储所有识别到的类型变体
    location: null,
    time: null,
    keywords: [],
    characteristics: [],
    normalizedText: '' // 规范化后的文本
  };

  // 先规范化全文
  features.normalizedText = text;
  for (const cat of ['type', 'color', 'brand']) {
    features.normalizedText = normalizeText(features.normalizedText, cat);
  }

  // ===== 类型提取（使用同义词）=====
  const typeDict = Object.keys(SYNONYMS.type);
  typeDict.forEach(type => {
    const allVariants = [type, ...SYNONYMS.type[type]];
    for (const variant of allVariants) {
      if (text.toLowerCase().includes(variant.toLowerCase())) {
        if (!features.type) {
          features.type = type;
        }
        if (!features.typeAliases.includes(variant)) {
          features.typeAliases.push(variant);
        }
        break; // 一个类型只记录一次
      }
    }
  });

  // ===== 颜色提取（使用同义词）=====
  const colorDict = Object.keys(SYNONYMS.color);
  colorDict.forEach(color => {
    const allVariants = [color, ...SYNONYMS.color[color]];
    for (const variant of allVariants) {
      if (text.toLowerCase().includes(variant.toLowerCase())) {
        if (!features.colors.includes(color)) {
          features.colors.push(color);
        }
        break;
      }
    }
  });

  // ===== 品牌提取（使用同义词）=====
  const brandDict = Object.keys(SYNONYMS.brand);
  brandDict.forEach(brand => {
    const allVariants = [brand, ...SYNONYMS.brand[brand]];
    for (const variant of allVariants) {
      if (text.toLowerCase().includes(variant.toLowerCase())) {
        features.brand = brand;
        return; // 只取第一个品牌
      }
    }
  });

  // ===== 地点提取 =====
  const locationDict = ['食堂', '图书馆', '教室', '宿舍', '操场', '实验室', '体育馆', '超市', '门口', '楼梯', '走廊', '卫生间', '食堂一楼', '图书馆二楼', '自习室', '会议室', '办公室', '停车场', '公交站', '地铁站'];
  locationDict.forEach(loc => {
    if (text.includes(loc)) {
      features.location = loc;
    }
  });

  // ===== 特征描述提取 =====
  const charPatterns = [
    /有.*划痕/, /磨损/, /破损/, /裂纹/, /旧/, /新/,
    /挂饰/, /贴纸/, /手机壳/, /保护套/, /壳/,
    /带.*图案/, /卡通/, /可爱/,
    /限量版/, /特别版/, /定制/,
    /防水/, /防摔/, /降噪/,
    /左耳/, /右耳/, /单只/, /一对/, /两只/,
    /Pro/, /Max/, /Plus/, /mini/, /SE/
  ];
  charPatterns.forEach(pattern => {
    const match = text.match(pattern);
    if (match) {
      features.characteristics.push(match[0]);
    }
  });

  // ===== 关键词提取 =====
  const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '想', '可以', '知道', '请', '帮', '帮忙', '谢谢', '感谢'];
  const words = text.split(/[\s，。！？、：；""''（）【】\-\+\*\/\\]/).filter(w => w.length > 1 && !stopWords.includes(w));
  features.keywords = [...new Set(words)];

  return features;
}

// 计算文本相似度（Jaccard + 关键词重叠）
function textSimilarity(textA, textB) {
  const wordsA = new Set(textA.toLowerCase().split(/[\s，。！？、：；""''（）【】]/).filter(w => w.length > 1));
  const wordsB = new Set(textB.toLowerCase().split(/[\s，。！？、：；""''（）【】]/).filter(w => w.length > 1));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = [...wordsA].filter(x => wordsB.has(x));
  const union = new Set([...wordsA, ...wordsB]);

  // Jaccard 相似度
  const jaccard = intersection.length / union.size;

  // 关键词覆盖率
  const coverageA = intersection.length / wordsA.size;
  const coverageB = intersection.length / wordsB.size;

  return Math.max(jaccard, (coverageA + coverageB) / 2);
}

// 增强版匹配引擎 v2
function calculateMatchScore(itemA, itemB) {
  let score = 0;
  const details = [];
  const factors = []; // 用于调试

  // ---- 1. 类型匹配（权重 35）----
  if (itemA.features.type && itemB.features.type) {
    if (itemA.features.type === itemB.features.type) {
      score += 35;
      details.push(`✅ 类型完全匹配：${itemA.features.type}`);
      factors.push({ name: 'type_exact', score: 35 });
    } else {
      // 检查是否是同一大类的不同表述
      const typeAAliases = [itemA.features.type, ...(itemA.features.typeAliases || [])];
      const typeBAliases = [itemB.features.type, ...(itemB.features.typeAliases || [])];
      const hasOverlap = typeAAliases.some(a => typeBAliases.some(b => a.toLowerCase() === b.toLowerCase()));
      if (hasOverlap) {
        score += 25;
        details.push(`🟡 类型相近：${itemA.features.type} ≈ ${itemB.features.type}`);
        factors.push({ name: 'type_similar', score: 25 });
      }
    }
  }

  // ---- 2. 颜色匹配（权重 20）----
  if (itemA.features.colors.length > 0 && itemB.features.colors.length > 0) {
    const commonColors = itemA.features.colors.filter(c => itemB.features.colors.includes(c));
    if (commonColors.length > 0) {
      score += 20 * (commonColors.length / Math.max(itemA.features.colors.length, itemB.features.colors.length));
      details.push(`✅ 颜色匹配：${commonColors.join('、')}`);
      factors.push({ name: 'color', score: 20 });
    }
  }

  // ---- 3. 品牌匹配（权重 15）----
  if (itemA.features.brand && itemB.features.brand) {
    if (itemA.features.brand.toLowerCase() === itemB.features.brand.toLowerCase()) {
      score += 15;
      details.push(`✅ 品牌匹配：${itemA.features.brand}`);
      factors.push({ name: 'brand', score: 15 });
    }
  }

  // ---- 4. 地点匹配（权重 10）----
  if (itemA.features.location && itemB.features.location) {
    if (itemA.features.location === itemB.features.location) {
      score += 10;
      details.push(`✅ 地点相同：${itemA.features.location}`);
      factors.push({ name: 'location', score: 10 });
    } else {
      // 检查是否是相近地点（如同一个建筑的楼层）
      const locA = itemA.features.location;
      const locB = itemB.features.location;
      if ((locA.includes(locB) || locB.includes(locA)) && locA.length > 1 && locB.length > 1) {
        score += 5;
        details.push(`🟡 地点相近：${locA} ≈ ${locB}`);
        factors.push({ name: 'location_nearby', score: 5 });
      }
    }
  }

  // ---- 5. 特征匹配（权重 10）----
  if (itemA.features.characteristics.length > 0 && itemB.features.characteristics.length > 0) {
    const commonChars = itemA.features.characteristics.filter(c =>
      itemB.features.characteristics.some(b => c.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(c.toLowerCase()))
    );
    if (commonChars.length > 0) {
      score += 10 * (commonChars.length / Math.max(itemA.features.characteristics.length, itemB.features.characteristics.length));
      details.push(`✅ 特征匹配：${commonChars.join('、')}`);
      factors.push({ name: 'characteristics', score: 10 });
    }
  }

  // ---- 6. 文本语义相似度（权重 10）----
  const sim = textSimilarity(itemA.description, itemB.description);
  if (sim > 0.15) {
    const simScore = Math.min(10, sim * 40); // 最高10分
    score += simScore;
    details.push(`🟡 描述相似度：${Math.round(sim * 100)}%`);
    factors.push({ name: 'text_similarity', score: simScore });
  }

  // ---- 7. 规范化文本关键词重叠（额外加分）----
  if (itemA.features.normalizedText && itemB.features.normalizedText) {
    const normSim = textSimilarity(itemA.features.normalizedText, itemB.features.normalizedText);
    if (normSim > sim + 0.1) { // 只有当规范化后明显提升时才额外加分
      score += 5;
      details.push(`🟡 AI语义分析发现更多关联`);
      factors.push({ name: 'normalized_similarity', score: 5 });
    }
  }

  // 判定匹配等级
  let matchLevel, confidence;
  if (score >= 55) {
    matchLevel = 'high';
    confidence = '高度匹配';
  } else if (score >= 35) {
    matchLevel = 'medium';
    confidence = '可能匹配';
  } else if (score >= 20) {
    matchLevel = 'low';
    confidence = '弱相关';
  } else {
    matchLevel = 'none';
    confidence = '不相关';
  }

  return { 
    score: Math.round(score), 
    details, 
    matchLevel,
    confidence,
    isMatch: score >= 20 // 降低阈值：20分以上都展示给用户
  };
}

// 生成验证问题（根据匹配等级动态调整难度）
function generateVerificationQuestions(lostItem, foundItem, matchLevel) {
  const questions = [];
  const lostText = lostItem.description;
  const foundText = foundItem.description;

  // 高度匹配：问更细节的问题
  if (matchLevel === 'high') {
    if (lostItem.features.characteristics.length > 0) {
      questions.push({
        question: `物品上有什么特殊的标记或特征？（如划痕、贴纸、挂饰等）`,
        answer: lostItem.features.characteristics[0],
        hint: `提示：失主提到了"${lostItem.features.characteristics[0]}"`,
        type: 'text'
      });
    }

    if (lostItem.features.colors.length > 0) {
      questions.push({
        question: `这件物品的具体颜色是什么？（越详细越好）`,
        answer: lostItem.features.colors.join('或'),
        type: 'text'
      });
    }

    questions.push({
      question: `请描述一下丢失/捡到的具体位置和时间`,
      answer: lostItem.features.location || lostText.slice(0, 30),
      type: 'text'
    });

  } else {
    // 中低匹配：问基础确认问题
    if (lostItem.features.type) {
      questions.push({
        question: `这是什么类型的物品？`,
        answer: lostItem.features.type,
        type: 'text'
      });
    }

    if (lostItem.features.colors.length > 0) {
      questions.push({
        question: `物品的主要颜色是什么？`,
        answer: lostItem.features.colors[0],
        type: 'choice'
      });
    }

    if (lostItem.features.brand) {
      questions.push({
        question: `这是什么品牌的？`,
        answer: lostItem.features.brand,
        type: 'text'
      });
    }

    // 补充问题确保至少2道
    if (questions.length < 2) {
      questions.push({
        question: `请简单描述一下这个物品的外观`,
        answer: lostItem.features.type || lostText.slice(0, 15),
        type: 'text'
      });
    }
  }

  return questions.slice(0, 3);
}

// 执行匹配（可被多次调用）
function runMatching(newItem) {
  const oppositeType = newItem.type === 'lost' ? 'found' : 'lost';
  const candidates = items.filter(i => i.type === oppositeType && i.status === 'active' && i.id !== newItem.id);

  const newMatches = [];
  candidates.forEach(candidate => {
    // 检查是否已存在这对组合的匹配
    const existingMatch = matches.find(m =>
      (m.lostItemId === (newItem.type === 'lost' ? newItem.id : candidate.id) &&
       m.foundItemId === (newItem.type === 'found' ? newItem.id : candidate.id))
    );

    if (existingMatch) {
      // 更新已有匹配的分数
      const result = calculateMatchScore(newItem, candidate);
      existingMatch.score = result.score;
      existingMatch.details = result.details;
      existingMatch.matchLevel = result.matchLevel;
      existingMatch.confidence = result.confidence;
      existingMatch.updatedAt = new Date().toISOString();
      if (result.isMatch && !newMatches.find(m => m.id === existingMatch.id)) {
        newMatches.push(existingMatch);
      }
    } else {
      const result = calculateMatchScore(newItem, candidate);
      if (result.isMatch) {
        const verificationQuestions = generateVerificationQuestions(
          newItem.type === 'lost' ? newItem : candidate,
          newItem.type === 'found' ? newItem : candidate,
          result.matchLevel
        );

        const match = {
          id: uuidv4(),
          lostItemId: newItem.type === 'lost' ? newItem.id : candidate.id,
          foundItemId: newItem.type === 'found' ? newItem.id : candidate.id,
          score: result.score,
          details: result.details,
          matchLevel: result.matchLevel,
          confidence: result.confidence,
          verificationQuestions,
          createdAt: new Date().toISOString(),
          status: 'pending'
        };
        matches.push(match);
        newMatches.push(match);
      }
    }
  });

  return newMatches.sort((a, b) => b.score - a.score);
}

// ========== API 路由 ==========

// 提交失物/拾物信息
app.post('/api/items', upload.single('image'), (req, res) => {
  const { type, description, contact, submitter } = req.body;

  if (!type || !description) {
    return res.status(400).json({ error: '类型和描述不能为空' });
  }

  // AI 特征提取
  const features = extractFeatures(description, req.file ? `/uploads/${req.file.filename}` : null);

  const item = {
    id: uuidv4(),
    type,
    description,
    contact: contact || '',
    submitter: submitter || '匿名',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    features,
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  items.push(item);

  // 自动运行AI匹配
  const newMatches = runMatching(item);

  res.json({
    success: true,
    item,
    features,
    matches: newMatches,
    totalMatches: matches.length
  });
});

// 获取所有物品列表
app.get('/api/items', (req, res) => {
  const { type, status } = req.query;
  let result = [...items];

  if (type) result = result.filter(i => i.type === type);
  if (status) result = result.filter(i => i.status === status);

  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ items: result, total: result.length });
});

// 获取匹配列表
app.get('/api/matches', (req, res) => {
  const { level, status } = req.query;
  let result = [...matches];

  if (level) result = result.filter(m => m.matchLevel === level);
  if (status) result = result.filter(m => m.status === status);

  res.json({
    matches: result.sort((a, b) => b.score - a.score),
    total: result.length
  });
});

// 对指定物品重新运行AI匹配
app.post('/api/items/:id/match', (req, res) => {
  const item = items.find(i => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: '物品不存在' });
  }

  // 重新提取特征（如果描述被更新过）
  item.features = extractFeatures(item.description, item.image);

  // 运行匹配
  const matchResults = runMatching(item);

  // 找到与该物品相关的所有匹配
  const relatedMatches = matches.filter(m =>
    m.lostItemId === item.id || m.foundItemId === item.id
  ).sort((a, b) => b.score - a.score);

  res.json({
    success: true,
    itemId: item.id,
    matches: relatedMatches,
    newMatches: matchResults,
    totalMatches: matches.length
  });
});

// 验证匹配
app.post('/api/matches/:id/verify', (req, res) => {
  const { id } = req.params;
  const { answers } = req.body;

  const match = matches.find(m => m.id === id);
  if (!match) {
    return res.status(404).json({ error: '匹配记录不存在' });
  }

  // 智能验证：模糊匹配答案
  let correctCount = 0;
  const results = [];

  match.verificationQuestions.forEach((q, idx) => {
    const userAnswer = (answers[idx] || '').toLowerCase().trim();
    const correctAnswer = (q.answer || '').toLowerCase().trim();

    if (!userAnswer) {
      results({ question: q.question, correct: false, reason: '未作答' });
      return;
    }

    // 精确匹配
    if (userAnswer === correctAnswer || userAnswer.includes(correctAnswer) || correctAnswer.includes(userAnswer)) {
      correctCount++;
      results.push({ question: q.question, correct: true });
      return;
    }

    // 包含匹配（答案包含关键词即可）
    const keywords = correctAnswer.split(/[,，、或]/).filter(k => k.trim());
    const hasKeyword = keywords.some(k => userAnswer.includes(k.trim()));
    if (hasKeyword) {
      correctCount++;
      results.push({ question: q.question, correct: true });
      return;
    }

    results.push({ question: q.question, correct: false, reason: '答案不匹配' });
  });

  const passed = correctCount >= Math.ceil(match.verificationQuestions.length / 2);
  match.status = passed ? 'verified' : 'failed';

  res.json({
    success: true,
    passed,
    correctCount,
    total: match.verificationQuestions.length,
    results,
    message: passed ? '✅ 验证通过！请联系对方确认交接方式' : '❌ 验证未通过，请确认信息是否正确'
  });
});

// 更新物品状态
app.patch('/api/items/:id/status', (req, res) => {
  const item = items.find(i => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: '物品不存在' });
  }

  item.status = req.body.status || item.status;
  res.json({ success: true, item });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n🚀 校园失物招领 AI 助手 v2 已启动`);
  console.log(`   📡 地址：http://localhost:${PORT}`);
  console.log(`   🤖 AI引擎：同义词映射 + 语义模糊匹配 + 多级置信度\n`);
});
