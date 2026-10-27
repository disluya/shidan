/** light 为深底白字，dark 为白底深字，沿用已有的主题名称与存储键。 */
(() => {
    const THEME_KEY = 'shopping_list_theme';
    const root = document.documentElement;
    function applyTheme(theme) {
        root.dataset.theme = theme;
        // Element Plus 用 dark 类启用深色组件，与本项目的主题名称相反。
        root.classList.toggle('dark', theme === 'light');
        document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#ffffff' : '#0f172a';
        return theme;
    }
    let savedTheme = 'light';
    try {
        savedTheme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch (error) {
        // 存储受限时，仍可使用默认主题。
    }
    applyTheme(savedTheme);
    window.AppTheme = Object.freeze({
        current: () => root.dataset.theme,
        toggle() {
            const theme = applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
            try {
                localStorage.setItem(THEME_KEY, theme);
            } catch (error) {
                // 只保留本次页面选择，不打断切换。
            }
            return theme;
        }
    });
})();
