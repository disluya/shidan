/**
 * store.js - Handles all data persistence exclusively through localStorage.
 *
 * Educational Note: This module abstracts localStorage interaction so the main app
 * doesn't need to know *how* data is stored, just *what* to store.
 * localStorage can only hold strings, so we use JSON.stringify() on the way in and
 * JSON.parse() on the way out to move whole JavaScript objects in and out of it.
 */

const Store = (function () {
    const STORAGE_KEY = 'shopping_list_data';
    const MALL_KEY = 'shopping_list_mall';
    const MALL_OPTIONS = ['天虹', '麦德龙'];

    /**
     * Builds the starting data for a browser that has never opened the app.
     *
     * Educational Note: this is a *function* rather than a plain shared object on
     * purpose. If every empty read returned the same object, the first addList()
     * would push into that shared template and quietly corrupt the defaults for
     * the rest of the page's life. Returning a fresh object each time avoids it.
     */
    function createDefaultData() {
        return {
            lists: [
                { id: 'list_1', name: '日常采购', items: [] }
            ],
            activeListId: 'list_1'
        };
    }

    function getData() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return createDefaultData();
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.error('Error parsing localStorage data:', error);
            return createDefaultData();
        }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    /** Nearly every operation below starts by locating one list inside the data. */
    function findList(data, listId) {
        return data.lists.find(list => list.id === listId);
    }

    /**
     * Educational Note: Date.now() alone is not unique enough here - adding two
     * items quickly enough lands them in the same millisecond and produces
     * duplicate ids, which then makes edits and deletes hit the wrong row.
     * A short random suffix makes a collision effectively impossible.
     */
    function createId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    /**
     * Returns a name that is not in `taken` yet, marking imported copies so an
     * existing list of the same name stays recognisable next to them.
     */
    function uniqueName(name, taken) {
        if (!taken.has(name)) return name;

        let candidate = `${name}（已导入）`;
        let counter = 2;
        while (taken.has(candidate)) {
            candidate = `${name}（已导入 ${counter}）`;
            counter++;
        }
        return candidate;
    }

    // --- Public API ---

    return {
        getLists() {
            return getData().lists;
        },

        getList(listId) {
            return findList(getData(), listId) || null;
        },

        getActiveListId() {
            return getData().activeListId;
        },

        setActiveListId(listId) {
            const data = getData();
            data.activeListId = listId;
            saveData(data);
        },

        /**
         * @param {string} name - The name of the new list
         * @param {string} namePrefix - 自动生成的固定前缀；不传时兼容原有清单
         * @returns {string} The new list's ID, so the caller can activate it
         */
        addList(name, namePrefix = '') {
            const data = getData();
            const id = createId('list');
            const list = { id, name, items: [] };
            if (namePrefix) {
                // 前缀与可编辑名称分开保存，改名时不会改动日期、时间或商场。
                list.namePrefix = namePrefix;
                list.baseName = name;
                list.name = namePrefix + (name ? '-' + name : '');
            }
            data.lists.push(list);
            saveData(data);
            return id;
        },

        /**
         * Adds lists from a backup file alongside the ones already stored.
         *
         * This is deliberately additive: nothing existing is overwritten, merged
         * or removed, because there is no server-side copy and no undo, so a
         * destructive import would be unrecoverable for the user. Imported
         * entries get brand new IDs rather than the ones in the file - an ID
         * that collided with a stored list would make a later edit or delete
         * act on the wrong one.
         *
         * @param {Array} lists - Validated lists, each with a name and items
         * @returns {string} The ID that should be active after importing
         */
        importLists(lists) {
            const data = getData();
            const takenNames = new Set(data.lists.map(list => list.name));

            lists.forEach(incoming => {
                const name = uniqueName(incoming.name, takenNames);
                takenNames.add(name);
                data.lists.push({
                    id: createId('list'),
                    name,
                    items: incoming.items.map(item => ({
                        id: createId('item'),
                        name: item.name,
                        completed: item.completed
                    }))
                });
            });

            // On a device with nothing saved yet, land on the first imported list.
            if (!data.lists.some(list => list.id === data.activeListId)) {
                data.activeListId = data.lists[0].id;
            }
            saveData(data);
            return data.activeListId;
        },

        renameList(listId, newName) {
            const data = getData();
            const list = findList(data, listId);
            if (list) {
                if (list.namePrefix) {
                    list.baseName = newName;
                    list.name = list.namePrefix + (newName ? '-' + newName : '');
                } else {
                    list.name = newName;
                }
                saveData(data);
            }
        },

        /**
         * @returns {string|null} The ID that should now be active - deleting the
         * active list falls back to the first remaining one, or null if none are left.
         */
        deleteList(listId) {
            const data = getData();
            data.lists = data.lists.filter(list => list.id !== listId);

            if (data.activeListId === listId) {
                data.activeListId = data.lists.length > 0 ? data.lists[0].id : null;
            }
            saveData(data);
            return data.activeListId;
        },

        addItem(listId, itemName) {
            const data = getData();
            const list = findList(data, listId);
            if (list) {
                list.items.push({ id: createId('item'), name: itemName, completed: false });
                saveData(data);
            }
        },

        renameItem(listId, itemId, newName) {
            const data = getData();
            const item = findList(data, listId)?.items.find(i => i.id === itemId);
            if (item) {
                item.name = newName;
                saveData(data);
            }
        },

        toggleItem(listId, itemId) {
            const data = getData();
            const item = findList(data, listId)?.items.find(i => i.id === itemId);
            if (item) {
                item.completed = !item.completed;
                saveData(data);
            }
        },

        deleteItem(listId, itemId) {
            const data = getData();
            const list = findList(data, listId);
            if (list) {
                list.items = list.items.filter(item => item.id !== itemId);
                saveData(data);
            }
        },

        reorderLists(oldIndex, newIndex) {
            const data = getData();
            if (oldIndex >= 0 && oldIndex < data.lists.length && newIndex >= 0 && newIndex < data.lists.length) {
                const [movedList] = data.lists.splice(oldIndex, 1);
                data.lists.splice(newIndex, 0, movedList);
                saveData(data);
            }
        },

        reorderItems(listId, oldIndex, newIndex) {
            const data = getData();
            const list = findList(data, listId);
            if (list && oldIndex >= 0 && oldIndex < list.items.length && newIndex >= 0 && newIndex < list.items.length) {
                const [movedItem] = list.items.splice(oldIndex, 1);
                list.items.splice(newIndex, 0, movedItem);
                saveData(data);
            }
        },

        getMallOptions() {
            return [...MALL_OPTIONS];
        },

        getPreferredMall() {
            try {
                const name = localStorage.getItem(MALL_KEY);
                return MALL_OPTIONS.includes(name) ? name : MALL_OPTIONS[0];
            } catch (error) {
                return MALL_OPTIONS[0];
            }
        },

        setPreferredMall(name) {
            if (MALL_OPTIONS.includes(name)) localStorage.setItem(MALL_KEY, name);
        }
    };
})();
