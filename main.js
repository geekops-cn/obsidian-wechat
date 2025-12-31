const { Plugin, View, Notice, MarkdownRenderer, WorkspaceLeaf, PluginSettingTab, TFile } = require('obsidian');

// 自定义视图类，用于在右侧面板显示微信HTML预览
class WeChatHtmlView extends View {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentFile = null;
  }

  getViewType() {
    return 'wechat-html-preview';
  }

  getDisplayText() {
    return '微信HTML预览';
  }

  getIcon() {
    return 'file-code';
  }

  async onOpen() {
    // 对于某些Obsidian版本，直接使用containerEl而不是依赖contentEl
    const container = this.containerEl;
    container.empty();
    
    // 创建内容容器
    const contentEl = container.createDiv('wechat-html-preview-container');
    
    // 创建头部
    const header = contentEl.createDiv('preview-header');
    header.createEl('h2', { text: '微信HTML预览' });
    
    // 创建主题选择下拉菜单
    const themeSelect = header.createEl('select', { 
      cls: 'theme-select',
      text: '选择主题' 
    });
    
    // 主题选项
  const themeOptions = [
    { value: 'default', label: '默认主题' },
    { value: 'tech', label: '技术博客' },
    { value: 'deepseek', label: 'deepseek主题' },
    { value: 'chatgpt', label: 'chatgpt主题' }
  ];
    
    // 添加选项
    themeOptions.forEach(option => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      optionEl.selected = this.plugin.settings.theme === option.value;
      themeSelect.appendChild(optionEl);
    });
    
    // 主题选择事件处理
    themeSelect.addEventListener('change', async () => {
      const selectedTheme = themeSelect.value;
      this.plugin.settings.theme = selectedTheme;
      this.plugin.settings.customCss = THEMES[selectedTheme];
      await this.plugin.saveSettings();
      new Notice(`已切换到${themeOptions.find(opt => opt.value === selectedTheme).label}！`);
      await this.refreshPreview();
    });
    
    // 创建复制按钮
    const copyButton = header.createEl('button', { text: '复制', cls: 'copy-button' });
    copyButton.addEventListener('click', () => this.copyHtml());
    
    // 创建刷新按钮
    const refreshButton = header.createEl('button', { text: '刷新', cls: 'refresh-button' });
    refreshButton.addEventListener('click', () => this.refreshPreview());
    
    // 创建预览内容区域
    this.previewContentEl = contentEl.createDiv('preview-content');
    
    // 添加样式标签
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = this.plugin.settings.customCss;
    this.previewContentEl.appendChild(this.styleEl);
    
    // 创建重要提示元素，使用自定义的重要提示文字
    this.importantNoteEl = document.createElement('div');
    this.importantNoteEl.className = 'important-note';
    // 初始颜色将在update方法中根据主题更新
    this.importantNoteEl.innerHTML = `<div style="margin-bottom: 24px; font-size: 16px; line-height: 1.8; color: #333;">${this.plugin.settings.importantNote}</div>`;
    this.previewContentEl.appendChild(this.importantNoteEl);
    
    // 应用默认主题颜色到note-label类的strong标签
    const noteLabelStrong = this.importantNoteEl.querySelector('.note-label');
    if (noteLabelStrong) {
      noteLabelStrong.style.color = '#0366d6' + ' !important'; // 默认主题色，后续会更新
    }
    
    // 创建Markdown内容容器
    this.markdownContentEl = document.createElement('div');
    this.markdownContentEl.className = 'markdown-content';
    this.previewContentEl.appendChild(this.markdownContentEl);
    
    // 保存contentEl引用，用于其他方法
    this.contentEl = contentEl;

    // 监听当前文件变化
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', (leaf) => {
        this.handleActiveLeafChange(leaf);
      })
    );

    // 监听文件内容变化
    this.plugin.registerEvent(
      this.plugin.app.vault.on('modify', (file) => {
        if (file === this.currentFile) {
          this.debouncedRefresh();
        }
      })
    );

    // 初始化防抖函数
    this.debounceTimer = null;

    // 初始加载
    this.handleActiveLeafChange(this.plugin.app.workspace.activeLeaf);
  }

  async onClose() {
    this.currentFile = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  handleActiveLeafChange(leaf) {
    // 只有当活动叶节点是markdown视图时，才更新当前文件
    if (leaf && leaf.view.getViewType() === 'markdown') {
      this.currentFile = leaf.view.file;
      this.refreshPreview();
    }
    // 当活动叶节点不是markdown视图时，保持当前预览状态，不要清空
    // 这样点击预览窗口不会导致预览内容消失
  }

  debouncedRefresh() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.refreshPreview();
    }, 300); // 300ms防抖
  }

  async refreshPreview() {
    if (!this.currentFile) {
      this.updateEmptyState();
      return;
    }

    try {
      const markdownContent = await this.plugin.app.vault.read(this.currentFile);
      await this.renderPreview(markdownContent, this.currentFile);
    } catch (error) {
      console.error('刷新预览失败:', error);
      new Notice('刷新预览失败！');
    }
  }

  async renderPreview(markdownContent, file) {
    // 确保previewContentEl存在
    if (!this.previewContentEl) {
      console.error('previewContentEl is undefined in WeChatHtmlView.renderPreview()');
      return;
    }
    
    // 获取当前主题
    const currentTheme = this.plugin.settings.theme;
    
    // 更新样式标签
    this.styleEl.textContent = this.plugin.settings.customCss;
    
    // 确定主题强调颜色
    let themeColor;
    switch (currentTheme) {
      case 'tech':
        themeColor = '#ff0000';
        break;
      case 'chatgpt':
        themeColor = '#d93026';
        break;
      case 'deepseek':
        themeColor = '#1a6dfc';
        break;
      default:
        themeColor = '#0366d6';
    }
    
    // 确保重要提示文字内容存在，直接使用完整的HTML内容
    this.importantNoteEl.innerHTML = `<div style="margin-bottom: 24px; font-size: 16px; line-height: 1.8; color: #333;">${this.plugin.settings.importantNote}</div>`;
    
    // 只设置带note-label类的strong标签的颜色，不影响用户自定义内容中的其他strong标签
    const noteLabelStrong = this.importantNoteEl.querySelector('.note-label');
    if (noteLabelStrong) {
      noteLabelStrong.style.color = themeColor + ' !important';
    }
    
    const tempEl = document.createElement('div');

    // 直接使用原始内容，让MarkdownRenderer处理所有格式
    await MarkdownRenderer.renderMarkdown(markdownContent, tempEl, file.path, this);
    
    // 处理本地图片路径
    // 1. 处理internal-embed元素（Obsidian内部图片链接）
    const internalEmbeds = tempEl.querySelectorAll('span.internal-embed');
    
    for (const embed of internalEmbeds) {
      const src = embed.getAttribute('src');
      if (src) {
        try {
          // 获取Obsidian vault
          const vault = this.plugin.app.vault;
          
          // 获取当前文件所在目录（使用传递进来的file参数，而不是this.currentFile）
          const currentFileDir = file ? file.parent.path : '';
          
          // 先尝试直接在vault中查找所有文件，根据文件名匹配
          const files = vault.getFiles();
          let foundFile = files.find(f => f.name === src);
          
          // 如果找不到，尝试在当前目录下查找
          if (!foundFile && currentFileDir) {
            foundFile = vault.getAbstractFileByPath(`${currentFileDir}/${src}`);
          }
          
          // 如果还是找不到，尝试遍历所有目录查找
          if (!foundFile || !(foundFile instanceof TFile)) {
            // 递归遍历vault中的所有文件
            const findFileRecursive = (dir) => {
              const children = vault.getFiles().concat(vault.getFolders());
              for (const child of children) {
                if (child instanceof TFile && child.name === src) {
                  return child;
                }
              }
              return null;
            };
            
            foundFile = findFileRecursive(vault.getRoot());
          }
          
          if (foundFile && foundFile instanceof TFile) {
            // 读取文件内容
            const arrayBuffer = await vault.readBinary(foundFile);
            
            // 获取文件扩展名
            const extension = foundFile.extension;
            
            // 转换为base64
            const blob = new Blob([arrayBuffer], { type: `image/${extension}` });
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            
            // 创建新的img元素
            const img = document.createElement('img');
            img.setAttribute('src', base64);
            img.setAttribute('alt', embed.getAttribute('alt') || foundFile.name);
            
            // 设置图片样式
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '24px auto';
            
            // 替换span元素为img元素
            embed.parentNode.replaceChild(img, embed);
          } else {
            console.error('找不到图片文件:', src);
            console.log('当前文件目录:', currentFileDir);
            console.log('所有文件:', vault.getFiles().map(f => f.name));
          }
        } catch (error) {
          console.error('处理内部嵌入图片失败:', error);
        }
      }
    }
    
    // 2. 处理普通img元素（app://协议）
    const imgElements = tempEl.querySelectorAll('img');
    
    for (const img of imgElements) {
      // 获取图片的src属性
      const src = img.getAttribute('src');
      
      if (src) {
        // 处理app://协议的图片（包括app://local/和app://<uuid>/格式）
        if (src.startsWith('app://')) {
          try {
            // 提取文件路径：移除app://<uuid>/前缀，然后解码URI，并移除可能的查询参数
            const filePath = decodeURIComponent(src.replace(/^app:\/\/[^\/]+\//, '').split('?')[0]);
            
            // 获取Obsidian vault
            const vault = this.plugin.app.vault;
            
            // 获取文件对象
            const fileObj = vault.getAbstractFileByPath(filePath);
            
            if (fileObj && fileObj instanceof TFile) {
              // 读取文件内容
              const arrayBuffer = await vault.readBinary(fileObj);
              
              // 获取文件扩展名
              const extension = fileObj.extension;
              
              // 转换为base64
              const blob = new Blob([arrayBuffer], { type: `image/${extension}` });
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              
              // 更新img的src属性
              img.setAttribute('src', base64);
            }
          } catch (error) {
            console.error('处理本地图片失败:', error);
          }
        }
      }
    }
    
    // 检查并处理mermaid图表
    const mermaidCodeBlocks = tempEl.querySelectorAll('pre.language-mermaid, pre.mermaid');
    
    if (mermaidCodeBlocks.length > 0) {
      // 为每个mermaid图表添加容器
      mermaidCodeBlocks.forEach((block, index) => {
        const codeEl = block.querySelector('code');
        const mermaidContent = codeEl ? codeEl.textContent : block.textContent;
        
        // 创建一个容器，直接显示mermaid图表
        const mermaidContainer = document.createElement('div');
        mermaidContainer.className = 'mermaid-preview';
        
        // 使用div元素直接渲染mermaid，后续通过JavaScript渲染
        mermaidContainer.innerHTML = `
          <div class="mermaid" style="text-align: center; padding: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 8px;">
            ${mermaidContent}
          </div>
        `;
        
        // 替换原始代码块
        block.parentNode.replaceChild(mermaidContainer, block);
      });
    }
    
    // 更新Markdown内容
    this.markdownContentEl.innerHTML = tempEl.innerHTML;
    
    // 直接在预览容器中插入内容，位置在重要提示之后，Markdown内容之前
    // 先保存现有的子元素
    const existingChildren = Array.from(this.previewContentEl.children);
    
    // 清空预览容器
    this.previewContentEl.innerHTML = '';
    
    // 重新添加元素：样式 -> 重要提示 -> Markdown内容
    this.previewContentEl.appendChild(this.styleEl);
    this.previewContentEl.appendChild(this.importantNoteEl);
    this.previewContentEl.appendChild(this.markdownContentEl);
    
    // 保存渲染后的HTML
    this.renderedHtml = this.importantNoteEl.innerHTML + tempEl.innerHTML;
    
    // 渲染mermaid图表
    this.renderMermaidCharts();
  }
  
  // 渲染mermaid图表的方法
  renderMermaidCharts() {
    // 检查是否已经加载了mermaid库
    if (typeof mermaid === 'undefined') {
      // 加载mermaid库
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js';
      script.onload = () => {
        this.doRenderMermaid();
      };
      script.onerror = (error) => {
        console.error('加载mermaid库失败:', error);
      };
      document.head.appendChild(script);
    } else {
      // mermaid库已经加载，直接渲染
      this.doRenderMermaid();
    }
  }
  
  // 实际渲染mermaid图表的方法
  doRenderMermaid() {
    try {
      // 初始化mermaid
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'Microsoft YaHei UI, Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 14
      });
      
      // 获取所有需要渲染的mermaid元素
      const mermaidElements = this.previewContentEl.querySelectorAll('.mermaid');
      
      // 渲染每个mermaid图表
      mermaidElements.forEach(async (element) => {
        try {
          // 获取mermaid代码
          const mermaidCode = element.textContent;
          
          // 清空元素内容
          element.innerHTML = '';
          
          // 渲染mermaid为SVG
          const svg = await mermaid.render(`mermaid-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, mermaidCode);
          
          // 将渲染后的SVG添加到元素中
          element.innerHTML = svg.svg;
          
          // 获取生成的SVG元素
          const svgElement = element.querySelector('svg');
          if (svgElement) {
            // 添加必要的命名空间
            if (!svgElement.hasAttribute('xmlns')) {
              svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            }
            if (!svgElement.hasAttribute('xmlns:xlink')) {
              svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            }
            
            // 移除可能导致问题的height属性
            svgElement.removeAttribute('height');
            
            // 设置SVG样式
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
            svgElement.style.display = 'block';
            svgElement.style.margin = '0 auto';
          }
        } catch (error) {
          console.error('渲染mermaid图表失败:', error);
          element.innerHTML = `<div style="color: red; padding: 16px; text-align: center;">渲染mermaid图表失败: ${error.message}</div>`;
        }
      });
    } catch (error) {
      console.error('初始化mermaid失败:', error);
    }
  }

  updateEmptyState() {
    // 确保previewContentEl存在
    if (!this.previewContentEl) {
      console.error('previewContentEl is undefined in WeChatHtmlView.updateEmptyState()');
      return;
    }
    
    // 清空内容容器，但保留样式标签
    this.importantNoteEl.innerHTML = '';
    this.markdownContentEl.innerHTML = '';
    
    // 在markdownContentEl中显示空状态
    this.markdownContentEl.innerHTML = `
      <div class="empty-state">
        <p>未打开Markdown文件</p>
        <p>请打开一个Markdown文件查看微信HTML预览</p>
      </div>
    `;
    
    this.renderedHtml = '';
  }

  // 将SVG转换为图片的辅助函数
  async svgToImage(svgElement) {
    return new Promise((resolve, reject) => {
      try {
        // 获取SVG的HTML内容
        let svgHtml = svgElement.outerHTML;
        
        // 确保SVG没有外部资源引用
        svgHtml = svgHtml.replace(/<use[^>]*xlink:href="[^#][^"]*"[^>]*>/g, '');
        
        // 添加xmlns属性确保SVG格式正确
        if (!svgHtml.includes('xmlns=')) {
          svgHtml = svgHtml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if (!svgHtml.includes('xmlns:xlink=')) {
          svgHtml = svgHtml.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }
        
        // 创建一个临时的SVG元素用于测量尺寸
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.innerHTML = svgHtml;
        
        // 获取SVG的尺寸
        const bbox = tempSvg.getBBox();
        const width = bbox.width || 800;
        const height = bbox.height || 600;
        
        // 创建一个新的Canvas元素
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        // 获取Canvas上下文
        const ctx = canvas.getContext('2d');
        
        // 填充白色背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // 尝试直接绘制SVG文本，避免使用Image对象导致的跨域问题
        try {
          // 将SVG转换为Data URL
          const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgHtml);
          
          // 创建一个新的Image对象
          const img = new Image();
          
          img.onload = () => {
            try {
              // 绘制图片
              ctx.drawImage(img, 0, 0, width, height);
              
              // 将Canvas转换为PNG图片
              const pngUrl = canvas.toDataURL('image/png');
              resolve(pngUrl);
            } catch (drawError) {
              console.error('绘制图片失败:', drawError);
              // 如果绘制失败，返回原SVG
              resolve(null);
            }
          };
          
          img.onerror = (error) => {
            console.error('加载SVG失败:', error);
            // 如果加载失败，返回原SVG
            resolve(null);
          };
          
          // 设置Image的src
          img.src = svgDataUrl;
        } catch (error) {
          console.error('处理SVG失败:', error);
          // 如果处理失败，返回原SVG
          resolve(null);
        }
      } catch (error) {
        console.error('SVG转换失败:', error);
        reject(error);
      }
    });
  }

  async copyHtml() {
    // 直接使用previewContentEl本身，因为它就是带有'preview-content'类的元素
    const previewContent = this.previewContentEl;
    if (!previewContent) {
      new Notice('没有可复制的内容！');
      return;
    }

    try {
      // 获取当前主题
      const currentTheme = this.plugin.settings.theme;
      
      // 创建一个临时容器，使用this.renderedHtml确保包含重要提示文字
      const finalContainer = document.createElement('div');
      finalContainer.innerHTML = this.renderedHtml;
      
      // 1. 特殊处理mermaid图表 - 将SVG转换为图片
      const mermaidContainers = finalContainer.querySelectorAll('.mermaid-preview');
      
      // 遍历每个mermaid容器，替换为图片
      for (let i = 0; i < mermaidContainers.length; i++) {
        const tempContainer = mermaidContainers[i];
        // 获取实际渲染的容器
        const liveContainer = previewContent.querySelectorAll('.mermaid-preview')[i];
        
        if (liveContainer) {
          // 直接从DOM中获取渲染好的SVG
          const svg = liveContainer.querySelector('.mermaid svg');
          if (svg) {
            try {
              // 将SVG转换为图片
              const imageUrl = await this.svgToImage(svg);
              
              if (imageUrl) {
                // 转换成功，使用图片
                // 创建一个图片元素
                const imgElement = document.createElement('img');
                imgElement.src = imageUrl;
                imgElement.alt = 'Mermaid Diagram';
                
                // 设置图片样式
                imgElement.style.maxWidth = '100%';
                imgElement.style.height = 'auto';
                imgElement.style.display = 'block';
                imgElement.style.margin = '15px auto';
                imgElement.style.borderRadius = '8px';
                imgElement.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                
                // 创建一个容器来包裹图片
                const imgWrapper = document.createElement('div');
                imgWrapper.style.textAlign = 'center';
                imgWrapper.style.margin = '15px 0';
                imgWrapper.style.width = '100%';
                imgWrapper.appendChild(imgElement);
                
                // 替换临时容器
                tempContainer.parentNode.replaceChild(imgWrapper, tempContainer);
              } else {
                // 转换失败，保留原始SVG并优化样式
                // 克隆SVG元素
                const svgClone = svg.cloneNode(true);
                
                // 确保SVG有正确的命名空间属性
                if (!svgClone.hasAttribute('xmlns')) {
                  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                }
                if (!svgClone.hasAttribute('xmlns:xlink')) {
                  svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
                }
                
                // 设置SVG属性和样式
                svgClone.setAttribute('width', '100%');
                svgClone.removeAttribute('height');
                svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                
                // 设置内联样式
                svgClone.style.maxWidth = '100%';
                svgClone.style.height = 'auto';
                svgClone.style.display = 'block';
                svgClone.style.margin = '15px auto';
                svgClone.style.boxSizing = 'border-box';
                svgClone.style.borderRadius = '8px';
                svgClone.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                
                // 替换临时容器
                tempContainer.innerHTML = '';
                tempContainer.appendChild(svgClone);
              }
            } catch (error) {
              console.error('处理SVG失败:', error);
              // 如果发生错误，保留原始SVG
            }
          }
        }
      }
      
      // 处理所有图片元素，确保本地图片正确显示
      const imgElements = finalContainer.querySelectorAll('img');
      
      for (let i = 0; i < imgElements.length; i++) {
        const img = imgElements[i];
        const originalImg = previewContent.querySelectorAll('img')[i];
        
        // 优先使用原始DOM中的图片，因为原始DOM中的图片可能已经被转换为base64
        if (originalImg && originalImg.src) {
          img.src = originalImg.src;
        } else if (img.src) {
          // 如果图片已经是base64或http协议，不需要处理
          if (img.src.startsWith('data:') || img.src.startsWith('http')) {
            continue;
          }
          
          // 获取Obsidian vault
          const vault = this.plugin.app.vault;
          let foundFile = null;
          let filePath = img.src;
          
          // 处理app://协议的图片（包括app://local/和app://<uuid>/格式）
          if (filePath.startsWith('app://')) {
            // 提取文件路径：移除app://<uuid>/前缀，然后解码URI，并移除可能的查询参数
            filePath = decodeURIComponent(filePath.replace(/^app:\/\/[^\/]+\//, '').split('?')[0]);
          }
          
          // 先尝试直接根据路径查找
          foundFile = vault.getAbstractFileByPath(filePath);
          
          // 如果找不到，尝试根据文件名查找
          if (!foundFile || !(foundFile instanceof TFile)) {
            // 提取文件名
            const fileName = filePath.split('/').pop();
            const files = vault.getFiles();
            foundFile = files.find(f => f.name === fileName);
          }
          
          if (foundFile && foundFile instanceof TFile) {
            try {
              // 使用Obsidian的API获取图片的base64编码
              const data = await vault.readBinary(foundFile);
              const blob = new Blob([data], { type: 'image/' + foundFile.extension });
              const reader = new FileReader();
              const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              
              img.src = dataUrl;
            } catch (err) {
              console.error('读取本地图片失败:', err);
            }
          }
        }
      }
      
      // 特殊处理pre元素，确保保留完整的代码内容和缩进
      const preElements = finalContainer.querySelectorAll('pre');
      preElements.forEach((pre, index) => {
        // 直接从原始DOM中获取对应位置的pre元素
        const originalPres = previewContent.querySelectorAll('pre');
        const originalPre = originalPres[index];
        if (originalPre) {
          // 克隆原始pre元素，保留所有内容和缩进
          const preClone = originalPre.cloneNode(true);
          
          // 为克隆的pre元素直接设置样式，确保在替换前样式正确
          preClone.style.backgroundColor = '#0f172a';
          preClone.style.padding = '24px 16px 16px';
          preClone.style.overflowX = 'auto';
          preClone.style.margin = '15px 0';
          preClone.style.border = '1px solid #334155';
          preClone.style.fontFamily = '"SF Mono", "Monaco", "Consolas", "Courier New", monospace';
          preClone.style.fontSize = '14px';
          preClone.style.lineHeight = '1.6';
          preClone.style.color = '#e2e8f0';
          preClone.style.whiteSpace = 'pre-wrap';
          preClone.style.position = 'relative';
          preClone.style.borderRadius = '8px';
          preClone.style.tabSize = '2';
          preClone.style.textIndent = '0';
          preClone.style.letterSpacing = '0';
          preClone.style.wordSpacing = '0';
          
          // 处理pre内的code元素
          const codeElements = preClone.querySelectorAll('code');
          codeElements.forEach((code, codeIndex) => {
            // 获取原始pre中的对应code元素
            const originalCode = originalPre.querySelectorAll('code')[codeIndex];
            if (originalCode) {
              // 直接使用原始code元素的内容，确保完全一致
              const originalCodeClone = originalCode.cloneNode(true);
              
              // 清空当前code元素并替换为原始克隆的code元素
              code.parentNode.replaceChild(originalCodeClone, code);
              
              // 为替换后的code元素设置样式
              originalCodeClone.style.backgroundColor = 'transparent';
              originalCodeClone.style.padding = '0';
              originalCodeClone.style.fontSize = '14px';
              originalCodeClone.style.lineHeight = '1.6';
              originalCodeClone.style.color = '#e2e8f0';
              originalCodeClone.style.border = 'none';
              originalCodeClone.style.display = 'block';
              originalCodeClone.style.whiteSpace = 'pre-wrap';
              originalCodeClone.style.tabSize = '2';
              originalCodeClone.style.textIndent = '0';
              originalCodeClone.style.letterSpacing = '0';
              originalCodeClone.style.wordSpacing = '0';
              
              // 处理原始code克隆中的span元素
              const originalSpanElements = originalCodeClone.querySelectorAll('span');
              originalSpanElements.forEach(span => {
                if (span.className.includes('keyword')) {
                  span.style.color = '#c4b5fd';
                  span.style.fontWeight = '600';
                } else if (span.className.includes('string')) {
                  span.style.color = '#86efac';
                } else if (span.className.includes('comment')) {
                  span.style.color = '#64748b';
                  span.style.fontStyle = 'italic';
                } else if (span.className.includes('function')) {
                  span.style.color = '#93c5fd';
                } else if (span.className.includes('number')) {
                  span.style.color = '#fbbf24';
                } else if (span.className.includes('class') || span.className.includes('type')) {
                  span.style.color = '#fde68a';
                } else if (span.className.includes('attr')) {
                  span.style.color = '#22d3ee';
                } else if (span.className.includes('tag')) {
                  span.style.color = '#fda4af';
                }
                // 移除class属性，保留内联样式
                span.removeAttribute('class');
              });
              
              // 移除code元素的class和id
              originalCodeClone.removeAttribute('class');
              originalCodeClone.removeAttribute('id');
            } else {
              // 如果没有原始code元素，直接设置样式
              code.style.backgroundColor = 'transparent';
              code.style.padding = '0';
              code.style.fontSize = '14px';
              code.style.lineHeight = '1.6';
              code.style.color = '#e2e8f0';
              code.style.border = 'none';
              code.style.display = 'block';
              code.style.whiteSpace = 'pre-wrap';
              code.style.tabSize = '2';
              code.style.textIndent = '0';
              code.style.letterSpacing = '0';
              code.style.wordSpacing = '0';
              
              // 处理代码高亮的span元素
              const spanElements = code.querySelectorAll('span');
              spanElements.forEach(span => {
                if (span.className.includes('keyword')) {
                  span.style.color = '#c4b5fd';
                  span.style.fontWeight = '600';
                } else if (span.className.includes('string')) {
                  span.style.color = '#86efac';
                } else if (span.className.includes('comment')) {
                  span.style.color = '#64748b';
                  span.style.fontStyle = 'italic';
                } else if (span.className.includes('function')) {
                  span.style.color = '#93c5fd';
                } else if (span.className.includes('number')) {
                  span.style.color = '#fbbf24';
                } else if (span.className.includes('class') || span.className.includes('type')) {
                  span.style.color = '#fde68a';
                } else if (span.className.includes('attr')) {
                  span.style.color = '#22d3ee';
                } else if (span.className.includes('tag')) {
                  span.style.color = '#fda4af';
                }
                // 移除class属性，保留内联样式
                span.removeAttribute('class');
              });
              
              // 移除code元素的class和id
              code.removeAttribute('class');
              code.removeAttribute('id');
            }
          });
          
          // 添加mac样式的三个彩色圆点
          const closeDot = document.createElement('div');
          closeDot.style.position = 'absolute';
          closeDot.style.top = '12px';
          closeDot.style.left = '12px';
          closeDot.style.width = '12px';
          closeDot.style.height = '12px';
          closeDot.style.borderRadius = '50%';
          closeDot.style.backgroundColor = '#ef4444';
          preClone.appendChild(closeDot);
          
          const minimizeDot = document.createElement('div');
          minimizeDot.style.position = 'absolute';
          minimizeDot.style.top = '12px';
          minimizeDot.style.left = '28px';
          minimizeDot.style.width = '12px';
          minimizeDot.style.height = '12px';
          minimizeDot.style.borderRadius = '50%';
          minimizeDot.style.backgroundColor = '#f59e0b';
          preClone.appendChild(minimizeDot);
          
          const maximizeDot = document.createElement('div');
          maximizeDot.style.position = 'absolute';
          maximizeDot.style.top = '12px';
          maximizeDot.style.left = '44px';
          maximizeDot.style.width = '12px';
          maximizeDot.style.height = '12px';
          maximizeDot.style.borderRadius = '50%';
          maximizeDot.style.backgroundColor = '#10b981';
          preClone.appendChild(maximizeDot);
          
          // 移除pre元素的class和id
          preClone.removeAttribute('class');
          preClone.removeAttribute('id');
          
          // 替换finalContainer中的pre元素
          pre.parentNode.replaceChild(preClone, pre);
        }
      });
      
      // 2. 遍历所有非pre元素，添加内联样式
      const allElements = finalContainer.querySelectorAll('*:not(pre)');
      allElements.forEach(element => {
        // 特殊处理：保留代码高亮的span元素（已经在pre处理中完成）
        
        // 移除元素的CSS类名和ID
        element.removeAttribute('class');
        element.removeAttribute('id');
        
        // 移除所有data-*属性
        const attributes = Array.from(element.attributes);
        attributes.forEach(attr => {
          if (attr.name.startsWith('data-')) {
            element.removeAttribute(attr.name);
          }
        });
        
        // 特殊处理非代码块元素，简化样式以确保微信兼容性
        const tagName = element.tagName.toLowerCase();
        
        // 根据元素类型设置内联样式
        switch (tagName) {
          case 'h1':
            element.style.fontSize = '26px';
            element.style.fontWeight = '700';
            element.style.margin = '40px 0 24px';
            element.style.color = '#1a1a1a';
            element.style.paddingBottom = '12px';
            element.style.borderBottom = '2px solid #e2e8f0';
            element.style.lineHeight = '1.3';
            break;
          case 'h2':
            if (currentTheme === 'tech') {
              element.style.fontSize = '20px';
              element.style.fontWeight = '600';
              element.style.margin = '25px 0 15px';
              element.style.color = 'white';
              element.style.padding = '10px 15px';
              element.style.borderRadius = '4px';
              element.style.borderLeft = 'none';
              element.style.background = '#ff0000';
              element.style.lineHeight = '1.4';
            } else if (currentTheme === 'chatgpt') {
              element.style.fontSize = '20px';
              element.style.fontWeight = '600';
              element.style.margin = '32px 0 16px';
              element.style.color = '#1a1a1a';
              element.style.padding = '12px 0 12px 16px';
              element.style.borderLeft = '4px solid #d93026';
              element.style.background = 'transparent';
              element.style.lineHeight = '1.4';
            } else if (currentTheme === 'deepseek') {
              element.style.fontSize = '20px';
              element.style.fontWeight = '600';
              element.style.margin = '36px 0 20px';
              element.style.color = '#1a6dfc';
              element.style.padding = '12px 0 12px 16px';
              element.style.borderLeft = '4px solid #1a6dfc';
              element.style.background = 'linear-gradient(90deg, rgba(26, 109, 252, 0.05) 0%, transparent 100%)';
              element.style.lineHeight = '1.4';
            } else {
              element.style.fontSize = '20px';
              element.style.fontWeight = '600';
              element.style.margin = '25px 0 15px';
              element.style.color = '#2d2d2d';
              element.style.borderLeft = 'none';
              element.style.background = 'transparent';
              element.style.lineHeight = '1.4';
            }
            break;
          case 'h3':
            if (currentTheme === 'tech') {
              element.style.fontSize = '17px';
              element.style.fontWeight = '600';
              element.style.margin = '20px 0 12px';
              element.style.color = '#ff0000';
              element.style.background = 'rgba(255, 0, 0, 0.05)';
              element.style.padding = '8px 12px';
              element.style.borderRadius = '3px';
              element.style.borderLeft = '3px solid #ff0000';
              element.style.lineHeight = '1.5';
            } else if (currentTheme === 'chatgpt') {
              element.style.fontSize = '17px';
              element.style.fontWeight = '600';
              element.style.margin = '24px 0 12px';
              element.style.color = '#d93026';
              element.style.background = 'rgba(217, 48, 38, 0.05)';
              element.style.padding = '8px 12px';
              element.style.borderLeft = '3px solid #d93026';
              element.style.lineHeight = '1.5';
            } else if (currentTheme === 'deepseek') {
              element.style.fontSize = '17px';
              element.style.fontWeight = '600';
              element.style.margin = '30px 0 16px';
              element.style.color = '#2563eb';
              element.style.background = 'linear-gradient(90deg, rgba(26, 109, 252, 0.03) 0%, transparent 100%)';
              element.style.padding = '8px 14px';
              element.style.borderLeft = '3px solid #2563eb';
              element.style.lineHeight = '1.5';
            } else {
              element.style.fontSize = '17px';
              element.style.fontWeight = '600';
              element.style.margin = '20px 0 12px';
              element.style.color = '#2d2d2d';
              element.style.background = 'transparent';
              element.style.paddingLeft = '12px';
              element.style.borderLeft = '3px solid #333';
              element.style.lineHeight = '1.5';
            }
            break;
          case 'h4':
            if (currentTheme === 'tech') {
              element.style.fontSize = '16px';
              element.style.fontWeight = '600';
              element.style.margin = '18px 0 10px';
              element.style.color = '#cc0000';
              element.style.background = 'rgba(255, 0, 0, 0.03)';
              element.style.padding = '6px 10px';
              element.style.borderRadius = '2px';
              element.style.borderLeft = '2px solid #cc0000';
            } else if (currentTheme === 'chatgpt') {
              element.style.fontSize = '16px';
              element.style.fontWeight = '600';
              element.style.margin = '20px 0 10px';
              element.style.color = '#ea4335';
              element.style.background = 'rgba(217, 48, 38, 0.03)';
              element.style.padding = '6px 10px';
              element.style.borderLeft = '2px solid #ea4335';
            } else if (currentTheme === 'deepseek') {
              element.style.fontSize = '16px';
              element.style.fontWeight = '600';
              element.style.margin = '24px 0 12px';
              element.style.color = '#3b82f6';
              element.style.background = 'linear-gradient(90deg, rgba(26, 109, 252, 0.02) 0%, transparent 100%)';
              element.style.padding = '6px 12px';
              element.style.borderLeft = '2px solid #3b82f6';
            } else {
              element.style.fontSize = '16px';
              element.style.fontWeight = '600';
              element.style.margin = '18px 0 10px';
              element.style.color = '#444';
              element.style.background = 'transparent';
              element.style.paddingLeft = '12px';
              element.style.borderLeft = '2px solid #666';
            }
            break;
          case 'h5':
          case 'h6':
            element.style.fontSize = '15px';
            element.style.fontWeight = '600';
            element.style.margin = '16px 0 8px';
            element.style.color = '#555';
            element.style.background = 'transparent';
            element.style.borderLeft = 'none';
            element.style.paddingLeft = '0';
            break;
          case 'p':
            element.style.fontSize = '16px';
            element.style.lineHeight = '1.8';
            element.style.color = '#333333';
            element.style.margin = '14px 0';
            break;
          case 'strong':
            element.style.fontWeight = '700';
            // 检查当前元素的父元素是否是重要提示段落，或者当前元素是否已有颜色样式
            if (!element.style.color || element.style.color === 'rgb(26, 26, 26)') {
              // 根据主题设置颜色
              if (currentTheme === 'tech') {
                element.style.color = '#ff0000';
              } else if (currentTheme === 'chatgpt') {
                element.style.color = '#d93026';
              } else if (currentTheme === 'deepseek') {
                element.style.color = '#1a6dfc';
              } else {
                element.style.color = '#0366d6';
              }
            }
            break;
          case 'em':
            element.style.fontStyle = 'italic';
            if (currentTheme === 'deepseek') {
              element.style.color = '#1a6dfc';
            } else {
              element.style.color = '#555555';
            }
            break;
          case 'blockquote':
            element.style.margin = '24px 0';
            element.style.padding = '16px 24px'; // 设置基本内边距
            element.style.position = 'relative';
            if (currentTheme === 'deepseek') {
              element.style.background = 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)';
              element.style.borderLeft = '4px solid #1a6dfc';
              // 移除任何现有的quote-marks元素
              const existingQuote = element.querySelector('.quote-marks');
              if (existingQuote) {
                existingQuote.remove();
              }
              // 创建一个实际的DOM元素作为引号，而不是使用伪元素
              const quoteMarks = document.createElement('span');
              quoteMarks.textContent = '❝';
              // 设置内联样式，确保在复制时能保留
              quoteMarks.style.position = 'absolute';
              quoteMarks.style.top = '3px'; // 调整到段落开始的顶部
              quoteMarks.style.left = '12px'; // 调整位置
              quoteMarks.style.color = '#1a6dfc';
              quoteMarks.style.opacity = '0.3';
              quoteMarks.style.fontSize = '28px';
              quoteMarks.style.fontFamily = 'serif';
              quoteMarks.style.zIndex = '1';
              quoteMarks.style.display = 'inline-block';
              quoteMarks.className = 'quote-marks';
              // 将引号元素添加到blockquote的开头
              element.insertBefore(quoteMarks, element.firstChild);
            } else if (currentTheme === 'tech') {
              element.style.background = '#f9f9f9';
              element.style.borderLeft = '4px solid #ff0000';
            } else if (currentTheme === 'chatgpt') {
              element.style.background = '#fafafa';
              element.style.borderLeft = '4px solid #d93026';
            } else {
              element.style.background = '#f9f9f9';
              element.style.borderLeft = '4px solid #ddd';
            }
            element.style.color = '#4a5568';
            element.style.borderRadius = '0 8px 8px 0';
            // 减少blockquote内第一个p元素的顶部margin，缩小与引号的距离
            const firstParagraph = element.querySelector('p:first-child');
            if (firstParagraph) {
              firstParagraph.style.marginTop = '8px';
            }
            break;
          case 'ul':
          case 'ol':
            element.style.margin = '20px 0';
            element.style.paddingLeft = '32px';
            break;
          case 'li':
            element.style.margin = '12px 0';
            element.style.color = '#333333';
            element.style.lineHeight = '1.7';
            break;
          case 'a':
            if (currentTheme === 'tech') {
              element.style.color = '#ff0000';
            } else if (currentTheme === 'chatgpt') {
              element.style.color = '#1a73e8';
            } else if (currentTheme === 'deepseek') {
              element.style.color = '#1a6dfc';
            } else {
              element.style.color = '#0366d6';
            }
            element.style.textDecoration = 'none';
            element.style.fontWeight = '500';
            break;
          case 'img':
            // 确保图片样式正确
            element.style.maxWidth = '100%';
            element.style.height = 'auto';
            element.style.margin = '24px auto';
            element.style.borderRadius = '8px';
            element.style.display = 'block';
            break;
          case 'hr':
            element.style.border = 'none';
            element.style.height = '1px';
            element.style.background = 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
            element.style.margin = '40px 0';
            break;
          case 'mark':
            if (currentTheme === 'tech') {
              element.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            } else if (currentTheme === 'chatgpt') {
              element.style.backgroundColor = 'rgba(255, 230, 0, 0.2)';
            } else if (currentTheme === 'deepseek') {
              element.style.backgroundColor = 'rgba(26, 109, 252, 0.1)';
            } else {
              element.style.backgroundColor = 'rgba(255, 230, 0, 0.2)';
            }
            element.style.color = '#1a1a1a';
            element.style.padding = '2px 6px';
            element.style.borderRadius = '3px';
            break;
        }
      });
      
      // 4. 移除所有不必要的标签
      const unwantedTags = finalContainer.querySelectorAll('style, script, iframe, embed, link');
      unwantedTags.forEach(tag => tag.remove());
      
      // 4. 获取处理后的HTML
      const cleanedHtml = finalContainer.innerHTML;
      
      // 5. 使用Clipboard API复制HTML
      const blob = new Blob([cleanedHtml], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/html': blob });
      await navigator.clipboard.write([clipboardItem]);
      
      new Notice('富文本已复制到剪贴板！');
    } catch (error) {
      console.error('复制富文本失败:', error);
      
      // 备用方案：直接复制HTML
      try {
        await navigator.clipboard.writeText(previewContent.innerHTML);
        new Notice('已复制HTML内容！');
      } catch (fallbackError) {
        console.error('备用复制方案也失败:', fallbackError);
        
        // 最终备用方案：复制纯文本
        try {
          await navigator.clipboard.writeText(previewContent.textContent);
          new Notice('已复制纯文本内容！');
        } catch (textError) {
          console.error('纯文本复制也失败:', textError);
          new Notice('复制失败！请尝试手动复制。');
        }
      }
    }
  }
}

// 主题列表定义
const THEMES = {
  default: `/* WeChat Compatible Styles */
.preview-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  background-color: #ffffff;
}

/* 标题样式 */
.preview-content h1 {
  font-size: 26px;
  font-weight: 700;
  margin: 30px 0 20px;
  color: #1a1a1a;
  border-bottom: none;
  padding-bottom: 0;
  background-color: transparent;
}

.preview-content h1::after {
  display: none;
}

.preview-content h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 25px 0 15px;
  color: #2d2d2d;
  border-bottom: none;
  padding-bottom: 0;
  background-color: transparent;
}

.preview-content h2::after {
  display: none;
}

.preview-content h3 {
  font-size: 17px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: #2d2d2d;
  background-color: transparent;
  padding-left: 0;
  border-left: 3px solid #333;
  padding-left: 12px;
}

.preview-content h3::before {
  display: none;
}

.preview-content h4 {
  font-size: 16px;
  font-weight: 600;
  margin: 18px 0 10px;
  color: #444;
  background-color: transparent;
  padding-left: 12px;
  border-left: 2px solid #666;
}

.preview-content h5, .preview-content h6 {
  font-size: 15px;
  font-weight: 600;
  margin: 16px 0 8px;
  color: #555;
  background-color: transparent;
  border-left: none;
  padding-left: 0;
}

.preview-content p {
  margin: 15px 0;
  text-align: justify;
}

/* 强调样式 */
.preview-content strong {
  font-weight: 600;
  color: #1a1a1a;
}

.preview-content em {
  font-style: italic;
  color: #555;
}

.preview-content del {
  text-decoration: line-through;
  color: #999;
}

/* 代码样式 */
.preview-content code {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  background-color: rgba(59, 130, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.2);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.preview-content pre {
  background-color: #0f172a;
  border-radius: 8px;
  padding: 32px 16px 16px;
  overflow-x: auto;
  margin: 15px 0;
  border: 1px solid #334155;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  position: relative;
}

.preview-content pre::before {
  content: '';
  position: absolute;
  top: 12px;
  left: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ef4444;
  box-shadow: 16px 0 0 #f59e0b, 32px 0 0 #10b981;
}

.preview-content pre code {
  background-color: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  border: none;
  box-shadow: none;
  color: #e2e8f0;
  display: block;
  white-space: pre;
}

/* 语法高亮样式 */
.preview-content pre code .hljs-keyword {
  color: #c4b5fd;
  font-weight: 600;
}

.preview-content pre code .hljs-string, 
.preview-content pre code .hljs-attr, 
.preview-content pre code .hljs-regexp, 
.preview-content pre code .hljs-variable {
  color: #86efac;
}

.preview-content pre code .hljs-comment {
  color: #64748b;
  font-style: italic;
}

.preview-content pre code .hljs-function {
  color: #93c5fd;
}

.preview-content pre code .hljs-number {
  color: #fbbf24;
}

.preview-content pre code .hljs-class, 
.preview-content pre code .hljs-type {
  color: #fde68a;
}

.preview-content pre code .hljs-property, 
.preview-content pre code .hljs-selector-id {
  color: #22d3ee;
}

.preview-content pre code .hljs-tag, 
.preview-content pre code .hljs-name {
  color: #fda4af;
}

.preview-content pre code .hljs-title {
  color: #93c5fd;
}

.preview-content pre code .hljs-attribute {
  color: #22d3ee;
}

.preview-content pre code .hljs-literal {
  color: #fbbf24;
}

.preview-content pre code .hljs-built_in, 
.preview-content pre code .hljs-template-tag {
  color: #c4b5fd;
}

.preview-content pre code .hljs-template-variable {
  color: #86efac;
}

.preview-content pre code .hljs-section {
  color: #93c5fd;
}

.preview-content pre code .hljs-meta {
  color: #93c5fd;
}

.preview-content pre code .hljs-deletion {
  background-color: #fda4af;
  color: #0f172a;
}

.preview-content pre code .hljs-addition {
  background-color: #86efac;
  color: #0f172a;
}

/* 列表样式 */
.preview-content ul, .preview-content ol {
  margin: 15px 0;
  padding-left: 25px;
}

.preview-content li {
  margin: 8px 0;
}

.preview-content ul li {
  list-style-type: disc;
}

.preview-content ul li::marker {
  color: #333;
}

.preview-content ol li {
  list-style-type: decimal;
}

.preview-content ol li::marker {
  color: #333;
  font-weight: normal;
}

/* 引用样式 */
.preview-content blockquote {
  margin: 15px 0;
  padding: 10px 20px;
  background-color: #f9f9f9;
  border-left: 4px solid #ddd;
  color: #666;
  box-shadow: none;
}

.preview-content blockquote::before {
  display: none;
}

/* 图片样式 */
.preview-content img {
  max-width: 100%;
  height: auto;
  margin: 15px 0;
  border-radius: 4px;
  box-shadow: none;
}

/* 表格样式 */
.preview-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 15px 0;
  overflow-x: auto;
  display: block;
  box-shadow: none;
}

.preview-content th, .preview-content td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.preview-content th {
  background-color: #f5f5f5;
  font-weight: 600;
  color: #333;
  text-transform: none;
  font-size: 14px;
  letter-spacing: normal;
}

.preview-content tr:nth-child(even) {
  background-color: transparent;
}

.preview-content tr:hover {
  background-color: transparent;
}

/* 水平规则 */
.preview-content hr {
  margin: 32px 0;
  border: none;
  border-top: 1px solid #ddd;
}

/* 链接样式 */
.preview-content a {
  color: #0366d6;
  text-decoration: none;
  border-bottom: none;
  font-weight: normal;
}

.preview-content a:hover {
  color: #0366d6;
  border-bottom: 1px solid #0366d6;
}

/* 键盘样式 */
.preview-content kbd {
  display: inline-block;
  padding: 4px 8px;
  font-family: 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  margin: 0 2px;
}

/* 定义列表 */
.preview-content dl {
  margin: 20px 0;
}

.preview-content dt {
  font-weight: 600;
  color: #333;
  margin: 16px 0 8px;
  font-size: 16px;
}

.preview-content dd {
  margin: 0 0 12px 24px;
  color: #666;
  line-height: 1.6;
}

/* 高亮文本 */
.preview-content mark {
  background-color: rgba(255, 230, 0, 0.2);
  color: #333;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: normal;
}

/* 自定义标注样式 */
.preview-content .callout, 
.preview-content .admonition {
  margin: 15px 0;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background-color: #ffffff;
  border-left: 4px solid #42b883;
}

.preview-content .admonition-attention {
  border-left-color: #ff9100;
  background-color: rgba(255, 145, 0, 0.05);
}

.preview-content .admonition-attention .callout-title,
.preview-content .admonition-attention .admonition-title {
  color: #ff9100;
}

.preview-content .callout-title, 
.preview-content .admonition-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: #42b883;
}

.preview-content .callout-icon, 
.preview-content .admonition-title-icon {
  margin-right: 8px;
  font-size: 16px;
}

.preview-content .callout-title-inner, 
.preview-content .admonition-title-content {
  font-size: 16px;
}

.preview-content .callout-content, 
.preview-content .admonition-content {
  color: #333;
  font-size: 14px;
  line-height: 1.5;
}

.preview-content .callout-content p, 
.preview-content .admonition-content p {
  margin: 8px 0;
}

/* Mermaid图表样式 */
.preview-content .mermaid-preview {
  margin: 15px 0;
  padding: 16px;
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.preview-content .mermaid {
  width: 100%;
  text-align: center;
}

.preview-content .mermaid svg {
  max-width: 100%;
  height: auto;
}
`,
  tech: `/* 技术博客主题 */
.preview-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  background-color: #ffffff;
}

/* 标题样式 */
.preview-content h1 {
   font-size: 26px;
  font-weight: 700;
  margin: 30px 0 20px;
  color: #1a1a1a;
  border-bottom: none;
  padding-bottom: 0;
  background-color: transparent;
}

.preview-content h1::after {
  display: none;
}

.preview-content h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 25px 0 15px;
  background-color: #ff0000;
  color: white;
  padding: 10px 15px;
  border-radius: 4px;
  border-bottom: none;
}

.preview-content h2::after {
  display: none;
}

.preview-content h3 {
  font-size: 17px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: #ff0000;
  background-color: rgba(255, 0, 0, 0.05);
  padding: 8px 12px;
  border-radius: 3px;
  border-left: 3px solid #ff0000;
}

.preview-content h3::before {
  display: none;
}

.preview-content h4 {
  font-size: 16px;
  font-weight: 600;
  margin: 18px 0 10px;
  color: #cc0000;
  background-color: rgba(255, 0, 0, 0.03);
  padding: 6px 10px;
  border-radius: 2px;
  border-left: 2px solid #cc0000;
}

.preview-content h5, .preview-content h6 {
  font-size: 15px;
  font-weight: 600;
  margin: 16px 0 8px;
  color: #666;
  background-color: transparent;
  border-left: none;
  padding-left: 0;
}

.preview-content p {
  margin: 15px 0;
  text-align: justify;
}

/* 强调样式 */
.preview-content strong {
  font-weight: 600;
  color: #1a1a1a;
}

.preview-content em {
  font-style: italic;
  color: #555;
}

.preview-content del {
  text-decoration: line-through;
  color: #999;
}

/* 代码样式 */
.preview-content code {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  background-color: rgba(59, 130, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.2);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.preview-content pre {
  background-color: #0f172a;
  border-radius: 8px;
  padding: 32px 16px 16px;
  overflow-x: auto;
  margin: 15px 0;
  border: 1px solid #334155;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  position: relative;
}

.preview-content pre::before {
  content: '';
  position: absolute;
  top: 12px;
  left: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ef4444;
  box-shadow: 16px 0 0 #f59e0b, 32px 0 0 #10b981;
}

.preview-content pre code {
  background-color: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  border: none;
  box-shadow: none;
  color: #e2e8f0;
  display: block;
  white-space: pre;
}

/* 语法高亮样式 */
.preview-content pre code .hljs-keyword {
  color: #c4b5fd;
  font-weight: 600;
}

.preview-content pre code .hljs-string, 
.preview-content pre code .hljs-attr, 
.preview-content pre code .hljs-regexp, 
.preview-content pre code .hljs-variable {
  color: #86efac;
}

.preview-content pre code .hljs-comment {
  color: #64748b;
  font-style: italic;
}

.preview-content pre code .hljs-function {
  color: #93c5fd;
}

.preview-content pre code .hljs-number {
  color: #fbbf24;
}

.preview-content pre code .hljs-class, 
.preview-content pre code .hljs-type {
  color: #fde68a;
}

.preview-content pre code .hljs-property, 
.preview-content pre code .hljs-selector-id {
  color: #22d3ee;
}

.preview-content pre code .hljs-tag, 
.preview-content pre code .hljs-name {
  color: #fda4af;
}

.preview-content pre code .hljs-title {
  color: #93c5fd;
}

.preview-content pre code .hljs-attribute {
  color: #22d3ee;
}

.preview-content pre code .hljs-literal {
  color: #fbbf24;
}

.preview-content pre code .hljs-built_in, 
.preview-content pre code .hljs-template-tag {
  color: #c4b5fd;
}

.preview-content pre code .hljs-template-variable {
  color: #86efac;
}

.preview-content pre code .hljs-section {
  color: #93c5fd;
}

.preview-content pre code .hljs-meta {
  color: #93c5fd;
}

.preview-content pre code .hljs-deletion {
  background-color: #fda4af;
  color: #0f172a;
}

.preview-content pre code .hljs-addition {
  background-color: #86efac;
  color: #0f172a;
}

/* 列表样式 */
.preview-content ul, .preview-content ol {
  margin: 15px 0;
  padding-left: 25px;
}

.preview-content li {
  margin: 8px 0;
}

.preview-content ul li {
  list-style-type: disc;
}

.preview-content ul li::marker {
  color: #ff0000;
}

.preview-content ol li {
  list-style-type: decimal;
}

.preview-content ol li::marker {
  color: #ff0000;
  font-weight: normal;
}

/* 引用样式 */
.preview-content blockquote {
  margin: 15px 0;
  padding: 10px 20px;
  background-color: #f9f9f9;
  border-left: 4px solid #ff0000;
  color: #666;
  box-shadow: none;
}

.preview-content blockquote::before {
  display: none;
}

/* 图片样式 */
.preview-content img {
  max-width: 100%;
  height: auto;
  margin: 15px 0;
  border-radius: 4px;
  box-shadow: none;
}

/* 表格样式 */
.preview-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 15px 0;
  overflow-x: auto;
  display: block;
  box-shadow: none;
}

.preview-content th, .preview-content td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.preview-content th {
  background-color: #ff0000;
  color: white;
  font-weight: 600;
  text-transform: none;
  font-size: 14px;
  letter-spacing: normal;
}

.preview-content tr:nth-child(even) {
  background-color: transparent;
}

.preview-content tr:hover {
  background-color: #ffebee;
}

/* 水平规则 */
.preview-content hr {
  margin: 32px 0;
  border: none;
  border-top: 1px solid #ddd;
}

/* 链接样式 */
.preview-content a {
  color: #ff0000;
  text-decoration: none;
  border-bottom: none;
  font-weight: normal;
}

.preview-content a:hover {
  color: #cc0000;
  border-bottom: 1px solid #ff0000;
}

/* 键盘样式 */
.preview-content kbd {
  display: inline-block;
  padding: 4px 8px;
  font-family: 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  margin: 0 2px;
}

/* 定义列表 */
.preview-content dl {
  margin: 20px 0;
}

.preview-content dt {
  font-weight: 600;
  color: #ff0000;
  margin: 16px 0 8px;
  font-size: 16px;
}

.preview-content dd {
  margin: 0 0 12px 24px;
  color: #666;
  line-height: 1.6;
}

/* 高亮文本 */
.preview-content mark {
  background-color: rgba(255, 0, 0, 0.1);
  color: #333;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: normal;
}

/* 自定义标注样式 */
.preview-content .callout, 
.preview-content .admonition {
  margin: 15px 0;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background-color: #ffffff;
  border-left: 4px solid #42b883;
}

.preview-content .admonition-attention {
  border-left-color: #ff9100;
  background-color: rgba(255, 145, 0, 0.05);
}

.preview-content .admonition-attention .callout-title,
.preview-content .admonition-attention .admonition-title {
  color: #ff9100;
}

.preview-content .callout-title, 
.preview-content .admonition-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: #42b883;
}

.preview-content .callout-icon, 
.preview-content .admonition-title-icon {
  margin-right: 8px;
  font-size: 16px;
}

.preview-content .callout-title-inner, 
.preview-content .admonition-title-content {
  font-size: 16px;
}

.preview-content .callout-content, 
.preview-content .admonition-content {
  color: #333;
  font-size: 14px;
  line-height: 1.5;
}

.preview-content .callout-content p, 
.preview-content .admonition-content p {
  margin: 8px 0;
}
`,
  deepseek: `/* 技术博客主题 - 优化版 */ 
 /* 符合技术文章风格，微软雅黑字体体系，微信式阅读体验 */ 
 
 /* 限制所有样式仅作用于预览内容区域 */ 
 .preview-content {
   font-family: "Microsoft YaHei UI", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; 
   font-size: 16px; 
   line-height: 1.8; 
   color: #1a1a1a; 
   max-width: 800px; 
   margin: 0 auto; 
   padding: 40px 20px; 
   background-color: #fefefe; 
   text-rendering: optimizeLegibility; 
   -webkit-font-smoothing: antialiased; 
   -moz-osx-font-smoothing: grayscale; 
 } 
 
 /* 标题层级优化 */ 
.preview-content h1 {
 font-size: 26px; 
 font-weight: 700; 
 margin: 40px 0 24px; 
 color: #1a1a1a; 
 padding-bottom: 12px; 
 border-bottom: 2px solid #e2e8f0; 
 position: relative; 
 background-color: transparent; 
} 

.preview-content h1::after { 
  content: ''; 
  position: absolute; 
  bottom: -2px; 
  left: 0; 
  width: 60px; 
  height: 2px; 
  background: #1a6dfc; 
} 

.preview-content h2 {
 font-size: 20px; 
 font-weight: 600; 
 margin: 36px 0 20px; 
 color: #1a6dfc; 
 padding: 12px 0; 
 border-left: 4px solid #1a6dfc; 
 padding-left: 16px; 
 background: linear-gradient(90deg, rgba(26, 109, 252, 0.05) 0%, transparent 100%); 
 border-bottom: none; 
} 

.preview-content h2::after { 
  display: none; 
} 

.preview-content h3 {
  font-size: 17px; 
  font-weight: 600; 
  margin: 30px 0 16px; 
  color: #2563eb; 
  background: linear-gradient(90deg, rgba(26, 109, 252, 0.03) 0%, transparent 100%); 
  padding: 8px 0 8px 14px; 
  border-left: 3px solid #2563eb; 
} 

.preview-content h3::before { 
  display: none; 
} 

.preview-content h4 {
  font-size: 16px; 
  font-weight: 600; 
  margin: 24px 0 12px; 
  color: #3b82f6; 
  background: linear-gradient(90deg, rgba(26, 109, 252, 0.02) 0%, transparent 100%); 
  padding: 6px 0 6px 12px; 
  border-left: 2px solid #3b82f6; 
} 

.preview-content h5, .preview-content h6 {
  font-size: 15px; 
  font-weight: 600; 
  margin: 20px 0 10px; 
  color: #4a5568; 
  background-color: transparent; 
  border-left: none; 
  padding-left: 0; 
}

/* 强调样式 */
.preview-content strong {
  font-weight: 700;
  color: #1a1a1a;
  background: linear-gradient(transparent 70%, rgba(26, 109, 252, 0.15) 0%);
  padding: 0 2px;
}

.preview-content em {
  font-style: italic;
  color: #1a6dfc;
  font-weight: 500;
}

.preview-content del {
  text-decoration: line-through;
  color: #a0aec0;
  opacity: 0.7;
}

/* 代码样式 */
.preview-content code {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  background-color: rgba(59, 130, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.2);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.preview-content pre {
  background-color: #0f172a;
  border-radius: 8px;
  padding: 32px 16px 16px;
  overflow-x: auto;
  margin: 15px 0;
  border: 1px solid #334155;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  position: relative;
}

.preview-content pre::before {
  content: '';
  position: absolute;
  top: 12px;
  left: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ef4444;
  box-shadow: 16px 0 0 #f59e0b, 32px 0 0 #10b981;
}

.preview-content pre code {
  background-color: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  border: none;
  box-shadow: none;
  color: #e2e8f0;
  display: block;
  white-space: pre;
}

/* 语法高亮样式 */
.preview-content pre code .hljs-keyword {
  color: #c4b5fd;
  font-weight: 600;
}

.preview-content pre code .hljs-string, 
.preview-content pre code .hljs-attr, 
.preview-content pre code .hljs-regexp, 
.preview-content pre code .hljs-variable {
  color: #86efac;
}

.preview-content pre code .hljs-comment {
  color: #64748b;
  font-style: italic;
}

.preview-content pre code .hljs-function {
  color: #93c5fd;
}

.preview-content pre code .hljs-number {
  color: #fbbf24;
}

.preview-content pre code .hljs-class, 
.preview-content pre code .hljs-type {
  color: #fde68a;
}

.preview-content pre code .hljs-property, 
.preview-content pre code .hljs-selector-id {
  color: #22d3ee;
}

.preview-content pre code .hljs-tag, 
.preview-content pre code .hljs-name {
  color: #fda4af;
}

.preview-content pre code .hljs-title {
  color: #93c5fd;
}

.preview-content pre code .hljs-attribute {
  color: #22d3ee;
}

.preview-content pre code .hljs-literal {
  color: #fbbf24;
}

.preview-content pre code .hljs-built_in, 
.preview-content pre code .hljs-template-tag {
  color: #c4b5fd;
}

.preview-content pre code .hljs-template-variable {
  color: #86efac;
}

.preview-content pre code .hljs-section {
  color: #93c5fd;
}

.preview-content pre code .hljs-meta {
  color: #93c5fd;
}

.preview-content pre code .hljs-deletion {
  background-color: #fda4af;
  color: #0f172a;
}

.preview-content pre code .hljs-addition {
  background-color: #86efac;
  color: #0f172a;
}

/* 列表样式 */
.preview-content ul, .preview-content ol {
  margin: 20px 0;
  padding-left: 32px;
}

.preview-content li {
  margin: 12px 0;
  color: #4a5568;
}

.preview-content ul li {
  list-style-type: disc;
}

.preview-content ul li::marker {
  color: #1a6dfc;
  font-weight: bold;
}

.preview-content ol li {
  list-style-type: decimal;
}

.preview-content ol li::marker {
  color: #1a6dfc;
  font-weight: bold;
}

/* 引用样式 */
.preview-content blockquote {
  margin: 24px 0;
  padding: 20px 24px;
  background: linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%);
  border-left: 4px solid #1a6dfc;
  color: #4a5568;
  border-radius: 0 8px 8px 0;
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.preview-content blockquote::before {
  content: "❝";
  position: absolute;
  top: 10px;
  left: 10px;
  color: #1a6dfc;
  opacity: 0.3;
  font-size: 24px;
  font-family: serif;
}

/* 图片样式 */
.preview-content img {
  max-width: 100%;
  height: auto;
  margin: 24px auto;
  border-radius: 8px;
  display: block;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.preview-content img:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

/* 表格样式 */
.preview-content table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 24px 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  overflow: hidden;
  display: table;
}

.preview-content th, .preview-content td {
  border: none;
  padding: 16px 20px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.preview-content th {
  background: linear-gradient(135deg, #1a6dfc 0%, #1a6dfc 100%);
  color: white;
  font-weight: 600;
  font-size: 15px;
  text-transform: none;
  letter-spacing: normal;
}

.preview-content tr:last-child td {
  border-bottom: none;
}

.preview-content tr:nth-child(even) {
  background-color: #f8fafc;
}

.preview-content tr:hover {
  background-color: #edf2f7;
}

/* 链接样式 */
.preview-content a {
  color: #1a6dfc;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.3s ease;
  font-weight: 500;
}

.preview-content a:hover {
  border-bottom: 1px solid #1a6dfc;
  color: #1557b7;
}

/* 水平线 */
.preview-content hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
  margin: 40px 0;
}

/* 键盘样式 */
.preview-content kbd {
  display: inline-block;
  padding: 4px 8px;
  font-family: 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #1a1a1a;
  background-color: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  margin: 0 2px;
  transition: all 0.2s ease;
}

/* 定义列表 */
.preview-content dl {
  margin: 20px 0;
}

.preview-content dt {
  font-weight: 600;
  color: #1a1a1a;
  margin: 16px 0 8px;
  font-size: 16px;
}

.preview-content dd {
  margin: 0 0 12px 24px;
  color: #4a5568;
  line-height: 1.6;
}

/* 高亮文本 */
.preview-content mark {
  background-color: rgba(26, 109, 252, 0.1);
  color: #1a1a1a;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}

/* 自定义标注样式 */
.preview-content .callout, 
.preview-content .admonition {
  margin: 15px 0;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background-color: #ffffff;
  border-left: 4px solid #42b883;
}

.preview-content .admonition-attention {
  border-left-color: #ff9100;
  background-color: rgba(255, 145, 0, 0.05);
}

.preview-content .admonition-attention .callout-title,
.preview-content .admonition-attention .admonition-title {
  color: #ff9100;
}

.preview-content .callout-title, 
.preview-content .admonition-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: #42b883;
}

.preview-content .callout-icon, 
.preview-content .admonition-title-icon {
  margin-right: 8px;
  font-size: 16px;
}

.preview-content .callout-title-inner, 
.preview-content .admonition-title-content {
  font-size: 16px;
}

.preview-content .callout-content, 
.preview-content .admonition-content {
  color: #333;
  font-size: 14px;
  line-height: 1.5;
}

.preview-content .callout-content p, 
.preview-content .admonition-content p {
  margin: 8px 0;
}

/* 响应式调整 - 仅影响预览内容 */
@media (max-width: 768px) {
  .preview-content {
    padding: 20px 16px !important;
    font-size: 15px !important;
  }
  
  .preview-content h1 {
    font-size: 28px !important;
  }
  
  .preview-content h2 {
    font-size: 22px !important;
  }
  
  .preview-content h3 {
    font-size: 19px !important;
  }
  
  .preview-content pre {
    padding: 16px !important;
    margin-left: -16px !important;
    margin-right: -16px !important;
    border-radius: 0 !important;
  }
  
  .preview-content table {
    display: block !important;
    overflow-x: auto !important;
  }
}

/* 打印优化 */
@media print {
  .preview-content {
    max-width: none !important;
    padding: 0 !important;
    background: white !important;
  }
  
  .preview-content pre, 
  .preview-content blockquote, 
  .preview-content table {
    break-inside: avoid !important;
  }
  
  .preview-content img {
    max-width: 100% !important;
  }
}

/* Mermaid图表样式 */
.preview-content .mermaid-preview {
  margin: 15px 0;
  padding: 16px;
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.preview-content .mermaid {
  width: 100%;
  text-align: center;
}

.preview-content .mermaid svg {
  max-width: 100%;
  height: auto;
}
`,
  chatgpt: `/* =============================== 
  * 基础排版（正文） 
  * =============================== */ 
 .preview-content { 
   font-family: "Microsoft YaHei UI", "Microsoft YaHei", 
                -apple-system, BlinkMacSystemFont, 
                "Segoe UI", Roboto, Arial, sans-serif; 
   font-size: 16px; 
   line-height: 1.75; 
   color: #2c2c2c; 
   max-width: 800px; 
   margin: 0 auto; 
   padding: 40px 20px; 
   background-color: #ffffff; 
 } 
 
 /* =============================== 
  * 标题系统 
  * =============================== */ 
 
 /* H1：文章主标题 */ 
.preview-content h1 { 
  font-size: 26px; 
  font-weight: 700; 
  margin: 36px 0 24px; 
  line-height: 1.3; 
  color: #1f1f1f; 
  border-bottom: 2px solid #eaeaea; 
  padding-bottom: 10px; 
  background-color: transparent; 
 } 
 
 .preview-content h1::after { 
   display: none; 
 } 
 
 /* H2：一级章节（重点） */ 
 .preview-content h2 {
   font-size: 20px; 
   font-weight: 600; 
   margin: 32px 0 16px; 
   line-height: 1.4; 
   color: #1a1a1a; 
   padding-left: 12px; 
   border-left: 4px solid #d93026; /* 微信红系，低饱和 */ 
   border-bottom: none; 
   background-color: transparent; 
 } 
 
 .preview-content h2::after { 
   display: none; 
 } 
 
 /* H3：二级章节 */ 
.preview-content h3 {
  font-size: 17px; 
  font-weight: 600; 
  margin: 24px 0 12px; 
  line-height: 1.5; 
  color: #d93026; 
  background-color: rgba(217, 48, 38, 0.05); 
  padding: 8px 0 8px 12px; 
  border-left: 3px solid #d93026; 
} 

.preview-content h3::before { 
  display: none; 
} 

/* H4-H6：说明性标题 */ 
.preview-content h4 {
  font-size: 16px; 
  font-weight: 600; 
  margin: 20px 0 10px; 
  color: #ea4335; 
  background-color: rgba(217, 48, 38, 0.03); 
  padding: 6px 0 6px 10px; 
  border-left: 2px solid #ea4335; 
} 

.preview-content h5, .preview-content h6 {
  font-size: 15px; 
  font-weight: 600; 
  margin: 18px 0 8px; 
  color: #555555; 
  background-color: transparent; 
  border-left: none; 
  padding-left: 0; 
} 
 
 /* =============================== 
  * 段落与行文 
  * =============================== */ 
 .preview-content p { 
   margin: 14px 0; 
   line-height: 1.75; 
   text-align: left; /* 中文不建议 justify */ 
 } 
 
 /* =============================== 
  * 行内强调 
  * =============================== */ 
 .preview-content strong { 
   font-weight: 600; 
   color: #1a1a1a; 
 } 
 
 .preview-content em { 
   font-style: italic; 
   color: #555555; 
 } 
 
 .preview-content del { 
   color: #999999; 
 } 
 
 /* =============================== 
 * 行内代码 
 * =============================== */ 
.preview-content code { 
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace; 
  background-color: rgba(59, 130, 246, 0.1); 
  padding: 2px 6px; 
  border-radius: 4px; 
  font-size: 0.9em; 
  color: #3b82f6; 
  border: 1px solid rgba(59, 130, 246, 0.2); 
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); 
} 

/* =============================== 
 * 代码块 
 * =============================== */ 
.preview-content pre {
  background-color: #0f172a;
  border-radius: 8px;
  padding: 32px 16px 16px;
  overflow-x: auto;
  margin: 15px 0;
  border: 1px solid #334155;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  position: relative;
}

.preview-content pre::before {
  content: '';
  position: absolute;
  top: 12px;
  left: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ef4444;
  box-shadow: 16px 0 0 #f59e0b, 32px 0 0 #10b981;
}

.preview-content pre code {
  background-color: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
  border: none;
  box-shadow: none;
  color: #e2e8f0;
  display: block;
  white-space: pre;
} 

/* 语法高亮样式 */
.preview-content pre code .hljs-keyword { 
  color: #c4b5fd; 
  font-weight: 600; 
} 

.preview-content pre code .hljs-string, 
.preview-content pre code .hljs-attr, 
.preview-content pre code .hljs-regexp, 
.preview-content pre code .hljs-variable { 
  color: #86efac; 
} 

.preview-content pre code .hljs-comment { 
  color: #64748b; 
  font-style: italic; 
} 

.preview-content pre code .hljs-function { 
  color: #93c5fd; 
} 

.preview-content pre code .hljs-number { 
  color: #fbbf24; 
} 

.preview-content pre code .hljs-class, 
.preview-content pre code .hljs-type { 
  color: #fde68a; 
} 

.preview-content pre code .hljs-property, 
.preview-content pre code .hljs-selector-id { 
  color: #22d3ee; 
} 

.preview-content pre code .hljs-tag, 
.preview-content pre code .hljs-name { 
  color: #fda4af; 
} 

.preview-content pre code .hljs-title { 
  color: #93c5fd; 
} 

.preview-content pre code .hljs-attribute { 
  color: #22d3ee; 
} 

.preview-content pre code .hljs-literal { 
  color: #fbbf24; 
} 

.preview-content pre code .hljs-built_in, 
.preview-content pre code .hljs-template-tag { 
  color: #c4b5fd; 
} 

.preview-content pre code .hljs-template-variable { 
  color: #86efac; 
} 

.preview-content pre code .hljs-section { 
  color: #93c5fd; 
} 

.preview-content pre code .hljs-meta { 
  color: #93c5fd; 
} 

.preview-content pre code .hljs-deletion { 
  background-color: #fda4af; 
  color: #0f172a; 
} 

.preview-content pre code .hljs-addition { 
  background-color: #86efac; 
  color: #0f172a; 
} 
 
 /* =============================== 
  * 列表 
  * =============================== */ 
 .preview-content ul, .preview-content ol { 
   margin: 16px 0; 
   padding-left: 28px; 
 } 
 
 .preview-content li { 
   margin: 6px 0; 
   line-height: 1.7; 
 } 
 
 .preview-content ul li { 
   list-style-type: disc; 
 } 
 
 .preview-content ul li::marker { 
   color: #d93026; 
 } 
 
 .preview-content ol li { 
   list-style-type: decimal; 
 } 
 
 .preview-content ol li::marker { 
   color: #d93026; 
   font-weight: normal; 
 } 
 
 /* =============================== 
  * 引用块 
  * =============================== */ 
 .preview-content blockquote { 
   margin: 20px 0; 
   padding: 12px 18px; 
   background-color: #fafafa; 
   border-left: 4px solid #d93026; 
   color: #555555; 
   box-shadow: none; 
 } 
 
 .preview-content blockquote::before { 
   display: none; 
 } 
 
 .preview-content blockquote p { 
   margin: 6px 0; 
 } 
 
 /* =============================== 
  * 图片 
  * =============================== */ 
 .preview-content img { 
   max-width: 100%; 
   height: auto; 
   margin: 20px 0; 
   border-radius: 6px; 
   box-shadow: none; 
 } 
 
 /* =============================== 
  * 表格 
  * =============================== */ 
 .preview-content table { 
   width: 100%; 
   border-collapse: collapse; 
   margin: 20px 0; 
   font-size: 14px; 
   box-shadow: none; 
   display: table; 
 } 
 
 .preview-content th, .preview-content td { 
   border: 1px solid #e5e7eb; 
   padding: 10px 12px; 
   text-align: left; 
 } 
 
 .preview-content th { 
   background-color: #f3f4f6; 
   font-weight: 600; 
   color: #2c2c2c; 
   text-transform: none; 
   letter-spacing: normal; 
   font-size: 14px; 
 } 
 
 .preview-content tr:nth-child(even) { 
   background-color: #fafafa; 
 } 
 
 .preview-content tr:hover { 
   background-color: #f5f5f5; 
 } 
 
 /* =============================== 
  * 水平规则 
  * =============================== */ 
 .preview-content hr { 
   margin: 32px 0; 
   border: none; 
   border-top: 1px solid #e5e7eb; 
 } 
 
 /* =============================== 
  * 链接样式 
  * =============================== */ 
 .preview-content a { 
   color: #1a73e8; 
   text-decoration: none; 
   border-bottom: 1px solid transparent; 
   transition: all 0.3s ease; 
   font-weight: 500; 
 } 
 
 .preview-content a:hover { 
   color: #1557b0; 
   border-bottom: 1px solid #1a73e8; 
   text-decoration: none; 
 } 
 
 /* =============================== 
  * 键盘样式 
  * =============================== */ 
 .preview-content kbd { 
   display: inline-block; 
   padding: 4px 8px; 
   font-family: 'Segoe UI', Roboto, sans-serif; 
   font-size: 12px; 
   font-weight: 500; 
   color: #2c2c2c; 
   background-color: #f3f4f6; 
   border: 1px solid #e5e7eb; 
   border-radius: 4px; 
   box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); 
   margin: 0 2px; 
   transition: all 0.2s ease; 
 } 
 
 /* =============================== 
  * 定义列表 
  * =============================== */ 
 .preview-content dl { 
   margin: 20px 0; 
 } 
 
 .preview-content dt { 
   font-weight: 600; 
   color: #2c2c2c; 
   margin: 16px 0 8px; 
   font-size: 16px; 
 } 
 
 .preview-content dd { 
   margin: 0 0 12px 24px; 
   color: #555555; 
   line-height: 1.6; 
 } 
 
 /* ===============================
* 高亮文本
* =============================== */
.preview-content mark {
  background-color: rgba(255, 230, 0, 0.2);
  color: #2c2c2c;
  padding: 2px 6px;
  border-radius: 3px;
}

/* Mermaid图表样式 */
.preview-content .mermaid-preview {
  margin: 15px 0;
  padding: 16px;
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.preview-content .mermaid {
  width: 100%;
  text-align: center;
}

.preview-content .mermaid svg {
  max-width: 100%;
  height: auto; 
  font-weight: normal; 
 } 

/* =============================== 
 * 自定义标注样式 
 * =============================== */ 
.preview-content .callout, 
.preview-content .admonition {
  margin: 15px 0;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background-color: #ffffff;
  border-left: 4px solid var(--callout-color, #42b883);
}

.preview-content .admonition-attention {
  --callout-color: #ff9100;
  border-left-color: var(--callout-color);
  background-color: rgba(255, 145, 0, 0.05);
}

.preview-content .callout-title, 
.preview-content .admonition-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--callout-color, #42b883);
}

.preview-content .callout-icon, 
.preview-content .admonition-title-icon {
  margin-right: 8px;
  font-size: 16px;
}

.preview-content .callout-title-inner, 
.preview-content .admonition-title-content {
  font-size: 16px;
}

.preview-content .callout-content, 
.preview-content .admonition-content {
  color: #333;
  font-size: 14px;
  line-height: 1.5;
}

.preview-content .callout-content p, 
.preview-content .admonition-content p {
  margin: 8px 0;
} 
`
};

// 默认设置常量
const DEFAULT_SETTINGS = {
  theme: "default",
  customCss: THEMES.default,
  importantNote: '<strong class="note-label">重要提示：</strong> 微信推送规则改版，未被标星的公众号文章无法展示完整封面，很容易错过。为防走丢，朋友们都加个星标吧！操作方法：<strong>关注"极客运维研习社"公众号—>点击右上角的...—>设为星标</strong>'
};

// 设置页面类
class WeChatHtmlSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    
    containerEl.empty();
    
    containerEl.createEl('h2', { text: '微信HTML导出设置' });
    
    // 主题选择设置
    const themeSetting = containerEl.createDiv();
    themeSetting.createEl('h3', { text: '主题设置' });
    
    // 重要提示文字设置
    const noteSetting = containerEl.createDiv();
    noteSetting.createEl('h3', { text: '重要提示文字设置' });
    
    const noteLabel = noteSetting.createEl('label', { text: '重要提示文字：' });
    noteLabel.style.display = 'block';
    noteLabel.style.marginBottom = '8px';
    noteLabel.style.fontWeight = '600';
    
    const noteTextarea = noteSetting.createEl('textarea');
    noteTextarea.value = this.plugin.settings.importantNote || DEFAULT_SETTINGS.importantNote;
    noteTextarea.style.width = '100%';
    noteTextarea.style.height = '120px';
    noteTextarea.style.padding = '8px';
    noteTextarea.style.border = '1px solid #ccc';
    noteTextarea.style.borderRadius = '4px';
    noteTextarea.style.fontFamily = 'monospace';
    noteTextarea.style.fontSize = '14px';
    
    noteTextarea.addEventListener('input', async () => {
      this.plugin.settings.importantNote = noteTextarea.value;
      await this.plugin.saveSettings();
      
      // 刷新所有打开的预览视图
      const leaves = this.app.workspace.getLeavesOfType('wechat-html-preview');
      leaves.forEach(leaf => {
        if (leaf.view && leaf.view.refreshPreview) {
          leaf.view.refreshPreview();
        }
      });
    });
    
    const noteHint = noteSetting.createEl('p');
    noteHint.textContent = '提示：重要提示文字会显示在HTML预览的顶部，用于向读者传达重要信息。支持HTML语法，如 <strong class="note-label">重要提示：</strong>、<span style="color:red">红色文字</span> 等。';
    noteHint.style.fontSize = '12px';
    noteHint.style.color = '#666';
    noteHint.style.marginTop = '8px';
  }
}

class WeChatHtmlExporterPlugin extends Plugin {

  async onload() {
    console.log('WeChat HTML Exporter plugin loaded');
    
    // 加载设置
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
    // 确保customCss与当前主题匹配
    if (!this.settings.customCss || this.settings.customCss !== THEMES[this.settings.theme]) {
      this.settings.customCss = THEMES[this.settings.theme];
      await this.saveSettings();
    }
    
    // 注册自定义视图
    this.registerView(
      'wechat-html-preview',
      (leaf) => new WeChatHtmlView(leaf, this)
    );
    
    // 添加侧边栏图标
    const ribbonIconEl = this.addRibbonIcon('document', '微信HTML预览', () => {
      this.activateView();
    });
    
    // 替换为自定义SVG图标
    ribbonIconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#07C160" opacity="0.2"/><path fill="#07C160" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/><path fill="#FFFFFF" d="M15 11h-1v2h-2v-2h-2v2h-2v-2H7v4h2v-1h2v1h2v-1h2v1h2v-4z"/><path fill="#FFFFFF" d="M12 14l3-3-3-3v6z" opacity="0.8"/></svg>';
    
    // 添加命令
    this.addCommand({
      id: 'toggle-preview',
      name: '切换微信HTML预览',
      callback: () => {
        this.activateView();
      }
    });

    // 注册设置页面
    this.addSettingTab(new WeChatHtmlSettingTab(this.app, this));
  }



  async onunload() {
    console.log('WeChat HTML Exporter plugin unloaded');
    // 清理所有视图
    this.app.workspace.detachLeavesOfType('wechat-html-preview');
  }

  // 保存设置
  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    // 检查是否已有打开的视图
    const existingLeaf = this.app.workspace.getLeavesOfType('wechat-html-preview')[0];
    
    if (existingLeaf) {
      // 激活已有视图
      this.app.workspace.revealLeaf(existingLeaf);
    } else {
      // 创建新视图在右侧面板
      await this.app.workspace.getRightLeaf(false).setViewState({
        type: 'wechat-html-preview'
      });
    }
  }

  wrapHtmlWithStyles(htmlContent) {
    // 使用用户自定义CSS
    const css = this.settings.customCss;
    
    // 微信公众号编辑器支持在HTML片段中使用style标签
    // 将样式标签放在HTML片段的开头，并将内容包裹在.preview-content容器中
    return `
      <style>${css}</style>
      <div class="preview-content">${htmlContent}</div>
    `;
  }
}

module.exports = WeChatHtmlExporterPlugin;