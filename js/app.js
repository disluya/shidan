/**
 * Vue 3 管理页面状态，Element Plus 提供交互组件。
 * Store 保持原有 localStorage 数据格式，旧清单无需迁移。
 */
(() => {
    const { createApp, markRaw } = Vue;
    const { ElMessage, ElMessageBox } = ElementPlus;
    let themeTransition = null;
    const ICONS = {
        menu: '<path d="M4 6h16M4 12h16M4 18h16"></path>',
        plus: '<path d="M12 5v14M5 12h14"></path>',
        close: '<path d="m6 6 12 12M18 6 6 18"></path>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>',
        edit: '<path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><path d="m16 3 5 5-10 10-5 1 1-5Z"></path>',
        copy: '<rect x="8" y="8" width="13" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>',
        trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"></path>',
        grip: '<path d="M7 8h10M7 12h10M7 16h10"></path>',
        theme: '<circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"></path>',
        lock: '<rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
        chevronDown: '<path d="m6 9 6 6 6-6"></path>',
        check: '<path d="m5 12 4 4L19 6"></path>',
        bag: '<path d="M5 7h14l1 14H4L5 7Z"></path><path d="M8 8V6a4 4 0 0 1 8 0v2"></path>'
    };

    const app = createApp({
        data() {
            return {
                lists: [],
                activeListId: null,
                listQuery: '',
                drawerOpen: false,
                listActionsOpen: false,
                theme: window.AppTheme.current(),
                itemCreate: {
                    open: false,
                    // listId: null, // 预留：恢复跨清单选择时启用。
                    name: '', error: '', saving: false
                },
                listCreate: { open: false, name: '', date: '', time: '', useDate: true, useTime: false, useMall: false, error: '', saving: false },
                mallOptions: Store.getMallOptions(),
                mallName: Store.getPreferredMall(),
                mallMenuOpen: false,
                drag: { id: null, overId: null },
                dragCleanup: null,
                installPrompt: null
            };
        },
        computed: {
            activeList() {
                return this.lists.find(list => list.id === this.activeListId) || null;
            },
            remainingCount() {
                return this.activeList ? this.activeList.items.filter(item => !item.completed).length : 0;
            },
            completedCount() {
                return this.activeList ? this.activeList.items.filter(item => item.completed).length : 0;
            },
            filteredLists() {
                // computed 只过滤视图，不修改清单数据，也不写入 localStorage。
                const query = this.listQuery.trim().toLocaleLowerCase();
                return query ? this.lists.filter(list => list.name.toLocaleLowerCase().includes(query)) : this.lists;
            },
            themeLabel() {
                return this.theme === 'dark' ? '切换为深底主题' : '切换为白底主题';
            },
            listNamePrefix() {
                // 只按固定顺序组合，勾选先后顺序不影响最终名称。
                const parts = [];
                if (this.listCreate.useDate) parts.push(this.listCreate.date);
                if (this.listCreate.useTime) parts.push(this.listCreate.time);
                if (this.listCreate.useMall) parts.push(this.mallName);
                return parts.filter(Boolean).join('-');
            }
        },
        mounted() {
            try {
                this.refresh();
            } catch (error) {
                ElMessage.error('无法读取本地清单，请检查浏览器的站点存储设置。');
            }
            window.addEventListener('beforeinstallprompt', this.handleInstallPrompt);
            window.addEventListener('appinstalled', this.handleInstalled);
            if (document.readyState === 'complete') this.registerServiceWorker();
            else window.addEventListener('load', this.registerServiceWorker, { once: true });
        },
        beforeUnmount() {
            if (this.dragCleanup) this.dragCleanup();
            window.removeEventListener('beforeinstallprompt', this.handleInstallPrompt);
            window.removeEventListener('appinstalled', this.handleInstalled);
            window.removeEventListener('load', this.registerServiceWorker);
        },
        methods: {
            refresh() {
                // 每次通过 Store 重新读取数据，再交给 Vue 响应式视图渲染。
                const previousId = this.activeListId;
                this.lists = Store.getLists();
                const storedId = Store.getActiveListId();
                this.activeListId = this.lists.some(list => list.id === storedId) ? storedId : (this.lists[0]?.id || null);
                if (this.activeListId !== previousId) this.listActionsOpen = false;
            },
            mutate(action) {
                try {
                    action();
                    this.refresh();
                    return true;
                } catch (error) {
                    ElMessage.error('无法保存，请检查浏览器存储空间和站点存储权限。');
                    return false;
                }
            },
            selectList(id) {
                if (this.mutate(() => Store.setActiveListId(id))) this.drawerOpen = false;
            },
            openItemCreate() {
                if (!this.activeList) return;
                this.drawerOpen = false;
                this.listCreate.open = false;
                this.itemCreate = {
                    open: true,
                    // listId: this.activeListId || this.lists[0]?.id || null, // 预留跨清单选择。
                    name: '', error: '', saving: false
                };
            },
            openListCreate() {
                this.drawerOpen = false;
                this.itemCreate.open = false;
                this.mallMenuOpen = false;
                // 在打开时取设备本地时间，编辑期间保持稳定，不让前缀自动跳动。
                const now = new Date();
                this.listCreate = {
                    open: true, name: '',
                    date: (now.getMonth() + 1) + '月' + now.getDate() + '日',
                    time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
                    useDate: true, useTime: false, useMall: false, error: '', saving: false
                };
            },
            focusItemInput() {
                this.$refs.itemNameInput?.focus();
            },
            focusListInput() {
                this.$refs.listNameInput?.focus();
            },
            resetItemError() {
                this.itemCreate.error = '';
            },
            resetListError() {
                this.listCreate.error = '';
            },
            submitItem() {
                if (!this.itemCreate.open || this.itemCreate.saving) return;
                const name = this.itemCreate.name.trim();
                if (!name) {
                    this.itemCreate.error = '请输入物品名称';
                    this.focusItemInput();
                    return;
                }
                // const listId = this.itemCreate.listId; // 恢复跨清单选择时启用，并替换下一行。
                const listId = this.activeListId;
                if (!this.lists.some(list => list.id === listId)) {
                    this.itemCreate.error = '当前清单不存在，请重新打开清单。';
                    return;
                }
                this.itemCreate.saving = true;
                const success = this.mutate(() => {
                    Store.addItem(listId, name);
                    // Store.setActiveListId(listId); // 跨清单添加时切换到所选清单。
                });
                this.itemCreate.saving = false;
                if (success) {
                    this.itemCreate.open = false;
                    ElMessage.success('已添加「' + name + '」');
                }
            },
            submitList() {
                if (!this.listCreate.open || this.listCreate.saving) return;
                const name = this.listCreate.name.trim();
                const prefix = this.listNamePrefix;
                if (!name && !prefix) {
                    this.listCreate.error = '清单名称不能为空';
                    this.focusListInput();
                    return;
                }
                this.listCreate.saving = true;
                const success = this.mutate(() => {
                    const id = Store.addList(name, prefix);
                    Store.setActiveListId(id);
                });
                this.listCreate.saving = false;
                if (success) {
                    this.listCreate.open = false;
                    this.listQuery = '';
                    ElMessage.success('已新建清单');
                }
            },
            selectMall(name) {
                if (!this.mallOptions.includes(name)) return;
                this.mallName = name;
                // 更换名称与勾选是两个独立动作，不自动勾选商场。
                try {
                    Store.setPreferredMall(name);
                } catch (error) {
                    ElMessage.info('已切换商场，但浏览器未能保存本次偏好。');
                }
            },
            async renameList() {
                if (!this.activeList) return;
                const list = this.activeList;
                try {
                    const message = list.namePrefix ? '固定前缀：' + list.namePrefix + '。只修改后面的清单名称。' : '输入新的清单名称';
                    const result = await ElMessageBox.prompt(message, '重命名清单', {
                        inputValue: list.baseName ?? list.name, confirmButtonText: '保存', cancelButtonText: '取消',
                        inputPlaceholder: list.namePrefix ? '请输入清单名称（选填）' : '请输入清单名称',
                        inputValidator: value => Boolean(value?.trim() || list.namePrefix) || '名称不能为空',
                        customClass: 'app-message-box'
                    });
                    this.mutate(() => Store.renameList(list.id, result.value.trim()));
                } catch (error) {
                    if (error !== 'cancel' && error !== 'close') ElMessage.error('暂时无法修改名称。');
                }
            },
            async renameItem(item) {
                const listId = this.activeListId;
                try {
                    const result = await ElMessageBox.prompt('输入新的物品名称', '重命名物品', {
                        inputValue: item.name, confirmButtonText: '保存', cancelButtonText: '取消',
                        inputPlaceholder: '请输入物品名称',
                        inputValidator: value => Boolean(value?.trim()) || '名称不能为空',
                        customClass: 'app-message-box'
                    });
                    this.mutate(() => Store.renameItem(listId, item.id, result.value.trim()));
                } catch (error) {
                    if (error !== 'cancel' && error !== 'close') ElMessage.error('暂时无法修改名称。');
                }
            },
            async deleteList(list) {
                try {
                    await ElMessageBox.confirm('确定删除「' + list.name + '」及其中的物品吗？', '删除清单', {
                        confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
                        autofocus: false, customClass: 'app-message-box'
                    });
                    this.mutate(() => Store.deleteList(list.id));
                } catch (error) {
                    if (error !== 'cancel' && error !== 'close') ElMessage.error('暂时无法删除清单。');
                }
            },
            toggleItem(id) {
                this.mutate(() => Store.toggleItem(this.activeListId, id));
            },
            deleteItem(id) {
                this.mutate(() => Store.deleteItem(this.activeListId, id));
            },
            async copyList() {
                if (!this.activeList) return;
                const list = this.activeList;
                const body = list.items.length ? list.items.map(item => '- ' + item.name).join('\n') : '- （空清单）';
                try {
                    await navigator.clipboard.writeText(list.name + '\n' + body + '\n');
                    ElMessage.success('清单已复制到剪贴板');
                } catch (error) {
                    ElMessage.error('复制失败，请检查浏览器的剪贴板权限。');
                }
            },
            toggleTheme(event) {
                const applyTheme = () => { this.theme = window.AppTheme.toggle(); };
                if (!document.startViewTransition) {
                    applyTheme();
                    return;
                }
                if (themeTransition) themeTransition.skipTransition();
                const button = event?.currentTarget?.getBoundingClientRect();
                const x = button ? button.left + button.width / 2 : window.innerWidth - 40;
                const y = button ? button.top + button.height / 2 : 40;
                const root = document.documentElement;
                root.classList.add('theme-reveal');
                root.style.setProperty('--theme-x', x + 'px');
                root.style.setProperty('--theme-y', y + 'px');
                root.style.setProperty('--theme-radius', Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 'px');
                // 用浏览器快照从按钮位置展开新主题，不复制界面或数据。
                const transition = document.startViewTransition(async () => {
                    applyTheme();
                    await this.$nextTick();
                });
                themeTransition = transition;
                transition.ready.catch(() => {});
                transition.finished.catch(() => {}).finally(() => {
                    if (themeTransition === transition) {
                        themeTransition = null;
                        root.classList.remove('theme-reveal');
                    }
                });
            },
            handleInstallPrompt(event) {
                event.preventDefault();
                this.installPrompt = markRaw(event);
            },
            handleInstalled() {
                this.installPrompt = null;
            },
            async installApp() {
                if (!this.installPrompt) return;
                const prompt = this.installPrompt;
                this.installPrompt = null;
                try {
                    await prompt.prompt();
                    await prompt.userChoice;
                } catch (error) {
                    ElMessage.info('可以从浏览器菜单中安装到主屏幕。');
                }
            },
            registerServiceWorker() {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('./sw.js').catch(() => {
                        console.error('[拾单] 离线缓存注册失败');
                    });
                }
            },
            startDrag(event, kind, id) {
                if (event.button !== 0 || (kind === 'lists' && this.listQuery.trim())) return;
                const source = event.target.closest('[data-sort-id]');
                if (!source) return;
                event.preventDefault();
                event.stopPropagation();
                if (this.dragCleanup) this.dragCleanup();
                const listId = this.activeListId;
                const rect = source.getBoundingClientRect();
                // 克隆节点只用于手指下的拖动预览；排序通过 Store 更新，Vue 负责真实 DOM。
                const ghost = source.cloneNode(true);
                ghost.classList.add('drag-preview');
                ghost.setAttribute('aria-hidden', 'true');
                Object.assign(ghost.style, {
                    width: rect.width + 'px', height: rect.height + 'px',
                    left: rect.left + 'px', top: rect.top + 'px'
                });
                document.body.appendChild(ghost);
                document.body.classList.add('is-sorting');
                this.drag = { id, overId: null };
                let overId = id;
                let after = false;
                let moved = false;
                const scrollArea = source.closest('.items-scroll, .drawer-list-scroll');
                const onMove = move => {
                    if (move.pointerId !== event.pointerId) return;
                    move.preventDefault();
                    const dy = move.clientY - event.clientY;
                    moved = moved || Math.abs(dy) > 6;
                    ghost.style.transform = 'translateY(' + dy + 'px)';
                    const hit = document.elementFromPoint(move.clientX, move.clientY)?.closest('[data-sort-id]');
                    if (hit && hit.dataset.sortKind === kind) {
                        overId = hit.dataset.sortId;
                        after = move.clientY > hit.getBoundingClientRect().top + hit.offsetHeight / 2;
                        this.drag.overId = overId === id ? null : overId;
                    }
                    if (scrollArea) {
                        const bounds = scrollArea.getBoundingClientRect();
                        if (move.clientY < bounds.top + 40) scrollArea.scrollTop -= 12;
                        else if (move.clientY > bounds.bottom - 40) scrollArea.scrollTop += 12;
                    }
                };
                const cleanup = () => {
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', onEnd);
                    document.removeEventListener('pointercancel', onEnd);
                    ghost.remove();
                    document.body.classList.remove('is-sorting');
                    this.drag = { id: null, overId: null };
                    this.dragCleanup = null;
                };
                const onEnd = end => {
                    if (end.pointerId !== event.pointerId) return;
                    const shouldSave = moved && end.type === 'pointerup';
                    cleanup();
                    if (!shouldSave) return;
                    const entries = kind === 'lists' ? this.lists : Store.getList(listId)?.items;
                    if (!entries) return;
                    const from = entries.findIndex(entry => entry.id === id);
                    const target = entries.findIndex(entry => entry.id === overId);
                    if (from < 0 || target < 0) return;
                    let to = target + (after ? 1 : 0);
                    if (from < to) to--;
                    if (from === to) return;
                    this.mutate(() => {
                        if (kind === 'lists') Store.reorderLists(from, to);
                        else Store.reorderItems(listId, from, to);
                    });
                };
                this.dragCleanup = cleanup;
                document.addEventListener('pointermove', onMove, { passive: false });
                document.addEventListener('pointerup', onEnd);
                document.addEventListener('pointercancel', onEnd);
            }
        }
    });

    app.component('app-icon', {
        props: { name: String, size: { type: Number, default: 21 } },
        computed: { markup() { return ICONS[this.name] || ICONS.plus; } },
        // v-html 只渲染上方固定 SVG 路径，不拼接用户输入。
        template: '<el-icon :size="size" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" v-html="markup"></svg></el-icon>'
    });
    app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
    app.mount('#app');
})();
