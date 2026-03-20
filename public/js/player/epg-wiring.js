(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const epgWiring = (player.epgWiring = player.epgWiring || {});

    epgWiring.create = function (options) {
        const opts = options || {};
        const epgDateTabs = opts.epgDateTabs || null;
        const getSelectedDate = typeof opts.getSelectedDate === 'function' ? opts.getSelectedDate : function () { return new Date(); };
        const setSelectedDate = typeof opts.setSelectedDate === 'function' ? opts.setSelectedDate : function () {};
        const onDateChange = typeof opts.onDateChange === 'function' ? opts.onDateChange : function () {};

        function buildDateTabs() {
            if (!epgDateTabs) return false;
            epgDateTabs.innerHTML = '';
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const items = [];
            for (let i = -3; i <= 3; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                items.push(d);
            }
            items.forEach(function (d) {
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                const sd = new Date(getSelectedDate());
                sd.setHours(0, 0, 0, 0);
                const isSel = d.getTime() === sd.getTime();
                const btnEl = document.createElement('button');
                btnEl.className = 'nav-link py-0 px-2 small text-nowrap' + (isSel ? ' active' : '');
                btnEl.textContent = (d.getTime() === today.getTime() ? '今日' : '周' + w) + ' ' + mm + '/' + dd;
                btnEl.onclick = function () {
                    setSelectedDate(new Date(d));
                    onDateChange();
                };
                const li = document.createElement('li');
                li.className = 'nav-item';
                li.appendChild(btnEl);
                epgDateTabs.appendChild(li);
                if (isSel) {
                    setTimeout(function () {
                        li.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }, 100);
                }
            });
            return true;
        }

        return { buildDateTabs: buildDateTabs };
    };
})();
