/* app.js — Versão com confirmação no cadastro, avatar automático e autenticação local simples.
   Substitua o app.js atual por este. Mantém roteamento por hash e localStorage.
*/
(() => {
    /* Helpers */
    const $ = sel => document.querySelector(sel);
    const qs = sel => Array.from(document.querySelectorAll(sel));
    const uid = (p='id') => p + Math.random().toString(36).slice(2,9);
    const read = k => JSON.parse(localStorage.getItem(k) || 'null');
    const write = (k,v) => localStorage.setItem(k, JSON.stringify(v));
    const USERS_KEY = 'arc_users_v3';
    const ITEMS_KEY = 'arc_items_v3';
    const CURRENT_USER_KEY = 'arc_current_user_v3';
    const CREDENTIALS_KEY = 'arc_credentials_v3'; // { userId: passwordHash }
  
    /* Crypto util: SHA-256 returns hex */
    async function sha256Hex(str){
      const enc = new TextEncoder().encode(str);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      const arr = Array.from(new Uint8Array(buf));
      return arr.map(b => b.toString(16).padStart(2,'0')).join('');
    }
  
    /* Utilities */
    function safe(s){ return String(s||''); }
    function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
    function showModalHtml(html){
      const m = $('#modal');
      m.innerHTML = `<div class="modal-card">${html}</div>`;
      m.classList.add('active'); m.setAttribute('aria-hidden','false');
    }
    function closeModal(){ const m = $('#modal'); m.classList.remove('active'); m.innerHTML = ''; m.setAttribute('aria-hidden','true'); }
  
    /* Confirm modal helper */
    function confirmModal(title, text){
      return new Promise(resolve => {
        showModalHtml(`<h3>${title}</h3><p class="muted">${text}</p><div style="text-align:right;margin-top:12px"><button id="modalCancel" class="btn ghost small">Cancelar</button> <button id="modalOk" class="btn small">Confirmar</button></div>`);
        $('#modalOk').onclick = () => { closeModal(); resolve(true); };
        $('#modalCancel').onclick = () => { closeModal(); resolve(false); };
      });
    }
  
    /* Prompt modal helper (returns value or null) */
    function promptModal(title, placeholder = '', type='text'){
      return new Promise(resolve => {
        showModalHtml(`<h3>${title}</h3><div style="margin-top:8px"><input id="modalInput" placeholder="${placeholder}" type="${type}" style="width:100%;padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:var(--muted)"/></div><div style="text-align:right;margin-top:12px"><button id="modalCancel" class="btn ghost small">Cancelar</button> <button id="modalOk" class="btn small">OK</button></div>`);
        $('#modalOk').onclick = ()=> { const v = $('#modalInput').value; closeModal(); resolve(v); };
        $('#modalCancel').onclick = ()=> { closeModal(); resolve(null); };
        setTimeout(()=> $('#modalInput').focus(), 80);
      });
    }
  
    /* Login modal (username + password) */
    function loginModal(prefillUserId = null){
      return new Promise(resolve => {
        showModalHtml(`<h3>Entrar</h3>
          <label style="display:block;margin-top:8px">Usuário (nome ou ID)
            <input id="modalUser" placeholder="username ou id" style="width:100%;padding:10px;border-radius:6px;margin-top:6px" />
          </label>
          <label style="display:block;margin-top:8px">Senha
            <input id="modalPass" type="password" placeholder="senha" style="width:100%;padding:10px;border-radius:6px;margin-top:6px" />
          </label>
          <div style="text-align:right;margin-top:12px">
            <button id="modalCancel" class="btn ghost small">Cancelar</button>
            <button id="modalOk" class="btn small">Entrar</button>
          </div>`);
        if(prefillUserId) $('#modalUser').value = prefillUserId;
        $('#modalOk').onclick = async () => {
          const u = $('#modalUser').value.trim();
          const p = $('#modalPass').value;
          closeModal();
          resolve({ usernameOrId: u, password: p });
        };
        $('#modalCancel').onclick = () => { closeModal(); resolve(null); };
        setTimeout(()=> $('#modalUser').focus(), 80);
      });
    }
  
    /* Toast */
    function showToast(txt){
      const el = document.createElement('div'); el.style = 'position:fixed;right:18px;bottom:18px;background:rgba(0,0,0,0.8);color:var(--gold);padding:10px 14px;border-radius:8px;border:1px solid rgba(199,168,75,0.08);z-index:2000'; el.textContent = txt;
      document.body.appendChild(el);
      setTimeout(()=> el.style.opacity = '0.01', 2000);
      setTimeout(()=> el.remove(), 2400);
    }
  
    /* Data keys helpers */
    const getUsers = () => read(USERS_KEY) || [];
    const getItems = () => read(ITEMS_KEY) || [];
    const setUsers = u => write(USERS_KEY, u);
    const setItems = i => write(ITEMS_KEY, i);
    const getCredentials = () => read(CREDENTIALS_KEY) || {}; // { userId: hash }
    const setCredentials = c => write(CREDENTIALS_KEY, c);
  
    /* Session helpers */
    function getCurrentUserId(){ return localStorage.getItem(CURRENT_USER_KEY) || null; }
    function setCurrentUserId(id){ if(id) localStorage.setItem(CURRENT_USER_KEY, id); else localStorage.removeItem(CURRENT_USER_KEY); updateNavForSession(); }
    function getCurrentUser(){ const id = getCurrentUserId(); if(!id) return null; return (getUsers().find(u=>u.id===id) || null); }
  
    /* Avatar auto-generation: simple initials + color if no avatarUrl provided */
    function makeAutoAvatar(name){
      const initials = (name || 'U').split(' ').filter(Boolean).map(p => p[0]).slice(0,2).join('').toUpperCase();
      // use data URL SVG
      const bg = ['c7a84b','a07a2f','bdaf86','8b6b2a'][Math.floor(Math.random()*4)];
      const fg = '0b0b0b';
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='100%' height='100%' fill='#${bg}'/><text x='50%' y='54%' font-family='Verdana,Arial' font-size='76' fill='#${fg}' text-anchor='middle' alignment-baseline='middle' font-weight='700'>${initials}</text></svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }
  
    /* Seed inicial se vazio */
    function seed(){
      const u1 = { id: uid('u'), username: 'marinus', displayName: 'Marinus', bio: 'Colecionador de cartas náuticas e mapas perdidos.', avatarUrl: '', createdAt: Date.now() };
      const u2 = { id: uid('u'), username: 'auro', displayName: 'Auro', bio: 'Procuro peças raras e curiosas.', avatarUrl: '', createdAt: Date.now() };
      const u3 = { id: uid('u'), username: 'selene', displayName: 'Selene', bio: 'Estudo simbologia cartográfica antiga.', avatarUrl: '', createdAt: Date.now() };
  
      const items = [
        { id: uid('it'), title: 'Carta Náutica do Porto Velho', description: 'Carta do século XVIII com marca de expedição e anotações à tinta.', owner: u1.id, rarity: 'Rare', condition: 'Good', dateAcquired: '1750-05-12', isForSale: true, price: 1200, images: ['https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?q=80&w=1200&auto=format&fit=crop&crop=entropy'], likes: 5, createdAt: Date.now() - 1000000 },
        { id: uid('it'), title: 'Bússola de Latão Gravada', description: 'Bússola funcional em latão com gravações do artesão.', owner: u2.id, rarity: 'Epic', condition: 'Near Mint', dateAcquired: '1820-01-01', isForSale: false, price: 0, images: ['https://images.unsplash.com/photo-1542353434-9c0cb0d6b3e6?q=80&w=1200&auto=format&fit=crop&crop=entropy'], likes: 8, createdAt: Date.now() - 500000 },
        { id: uid('it'), title: 'Mapa Estelar Antigo', description: 'Representação das constelações usada por navegadores antigos.', owner: u3.id, rarity: 'Legendary', condition: 'Fair', dateAcquired: '1600-03-01', isForSale: false, price: 0, images: ['https://images.unsplash.com/photo-1519125323398-675f0ddb6308?q=80&w=1200&auto=format&fit=crop&crop=entropy'], likes: 13, createdAt: Date.now() - 200000 }
      ];
  
      write(USERS_KEY, [u1,u2,u3]);
      write(ITEMS_KEY, items);
      write(CREDENTIALS_KEY, {}); // clear credentials
      localStorage.removeItem(CURRENT_USER_KEY);
      renderRoute();
    }
  
    /* Update navigation depending on session */
    function updateNavForSession(){
      const currentId = getCurrentUserId();
      const navCreate = $('#navCreateUser');
      const navMy = $('#navMyProfile');
      const navLogout = $('#navLogout');
  
      if(navCreate && navMy && navLogout){
        if(currentId){
          navCreate.style.display = 'none';
          navMy.style.display = '';
          navMy.href = '#/users/' + currentId;
          navLogout.style.display = '';
        } else {
          navCreate.style.display = '';
          navMy.style.display = 'none';
          navLogout.style.display = 'none';
        }
      }
    }
  
    /* Routing helpers (kept similar ao anterior) */
    function parseHash(){
      const raw = location.hash.slice(1) || '/';
      const [path, q] = raw.split('?');
      const parts = path.split('/').filter(Boolean);
      const params = new URLSearchParams(q || '');
      return { raw, parts, params };
    }
  
    function renderRoute(){
      updateNavForSession();
      const { parts } = parseHash();
      const view = $('#view'); view.innerHTML = '';
      bindSearch();
  
      if(parts[0] === 'users' && parts[1] === 'me'){
        const cur = getCurrentUser();
        if(cur) { location.hash = '#/users/' + cur.id; return; }
        else { location.hash = '#/create-user'; return; }
      }
  
      if(parts.length === 0) renderHome();
      else if(parts[0] === 'items' && !parts[1]) renderItems();
      else if(parts[0] === 'items' && parts[1]) renderItemPage(parts[1]);
      else if(parts[0] === 'users' && parts[1]) renderUserPage(parts[1]);
      else if(parts[0] === 'create-item') renderItemForm();
      else if(parts[0] === 'create-user') renderUserForm();
      else renderNotFound();
    }
  
    /* Renderers (adaptados) */
    function renderHome(){
      const tpl = document.getElementById('tpl-home').content.cloneNode(true);
      $('#view').appendChild(tpl);
  
      const featured = getItems().slice().sort((a,b)=> (b.likes||0) - (a.likes||0)).slice(0,6);
      const featuredEl = $('#featured');
      featuredEl.innerHTML = featured.map(i => cardHtml(i)).join('');
      bindCardClicks();
  
      const recent = getUsers().slice().sort((a,b)=>b.createdAt - a.createdAt).slice(0,8);
      const ru = $('#recentUsers');
      ru.innerHTML = recent.map(u => `<div class="user-pill" data-id="${u.id}">${safe(u.displayName||u.username)}</div>`).join('');
      qs('.user-pill').forEach(el => el.onclick = ()=> location.hash = `#/users/${el.dataset.id}`);
    }
  
    let currentPage = 1, pageSize = 8;
    function renderItems(){
      const tpl = document.getElementById('tpl-items').content.cloneNode(true);
      $('#view').appendChild(tpl);
  
      const fRarity = $('#f-rarity');
      const fCond = $('#f-condition');
      const fSale = $('#f-forSale');
      const sortSelect = $('#sortSelect');
  
      const { params } = parseHash();
      currentPage = parseInt(params.get('p')) || 1;
  
      function apply(){
        let items = getItems().slice();
        if(fRarity.value) items = items.filter(x => x.rarity === fRarity.value);
        if(fCond.value) items = items.filter(x => (x.condition||'') === fCond.value);
        if(fSale.value !== '') items = items.filter(x => String(x.isForSale) === fSale.value);
        const sort = sortSelect.value;
        if(sort === 'newest') items.sort((a,b)=>b.createdAt - a.createdAt);
        else if(sort === 'oldest') items.sort((a,b)=>a.createdAt - b.createdAt);
        else if(sort === 'price-asc') items.sort((a,b)=> (a.price||0) - (b.price||0));
        else if(sort === 'price-desc') items.sort((a,b)=> (b.price||0) - (a.price||0));
        else if(sort === 'rarity') items.sort((a,b)=> a.rarity.localeCompare(b.rarity));
  
        const total = items.length;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        currentPage = clamp(currentPage, 1, pages);
        const start = (currentPage - 1) * pageSize;
        const pageItems = items.slice(start, start + pageSize);
        $('#itemsList').innerHTML = pageItems.map(i => cardHtml(i)).join('');
        bindCardClicks();
        $('#pageInfo').textContent = `Página ${currentPage} de ${pages} • ${total} itens`;
        $('#prevPage').onclick = ()=>{ if(currentPage>1){ currentPage--; pushPage(); apply(); } };
        $('#nextPage').onclick = ()=>{ if(currentPage<pages){ currentPage++; pushPage(); apply(); } };
      }
      function pushPage(){ const p = new URLSearchParams(); if(currentPage>1) p.set('p', currentPage); const q = p.toString(); location.hash = '#/items' + (q ? '?' + q : ''); }
  
      [fRarity,fCond,fSale,sortSelect].forEach(el => el.onchange = ()=> { currentPage = 1; apply(); });
      apply();
    }
  
    function renderItemPage(id){
      const item = getItems().find(x => x.id === id);
      if(!item) return renderNotFound();
      const tpl = document.getElementById('tpl-item').content.cloneNode(true);
      $('#view').appendChild(tpl);
  
      $('#item-img').src = (item.images && item.images[0]) || placeholderFor(item.title);
      $('#item-title').textContent = item.title;
      $('#item-rarity').textContent = item.rarity;
      $('#item-condition').textContent = item.condition;
      $('#item-date').textContent = item.dateAcquired ? new Date(item.dateAcquired).toLocaleDateString() : '';
      $('#item-desc').textContent = item.description || '';
      const owner = getUsers().find(u=>u.id===item.owner) || {};
      $('#item-owner').textContent = owner.displayName || owner.username || 'Usuário';
      $('#item-owner').href = `#/users/${owner.id || ''}`;
      $('#item-sale').textContent = item.isForSale ? `À venda — R$ ${item.price}` : 'Não à venda';
      $('#likeCount').textContent = item.likes || 0;
  
      const thumbs = $('#item-thumbs'); thumbs.innerHTML = '';
      (item.images||[]).forEach((src, idx) => {
        const img = document.createElement('img'); img.src = src; img.alt = item.title + ' ' + idx;
        img.onclick = ()=> $('#item-img').src = src;
        thumbs.appendChild(img);
      });
  
      const infoList = $('#item-info-list');
      infoList.innerHTML = `<li><strong>ID:</strong> ${item.id}</li><li><strong>Criado:</strong> ${new Date(item.createdAt).toLocaleString()}</li><li><strong>Raridade:</strong> ${item.rarity}</li>`;
  
      $('#toggleLike').onclick = () => {
        const items = getItems(); const it = items.find(x=>x.id===item.id); it.likes = (it.likes||0)+1; setItems(items); $('#likeCount').textContent = it.likes; showToast('Item curtido');
      };
      $('#toggleSale').onclick = () => {
        // require ownership + auth
        requireAuthForAction(item.owner, async (okUserId) => {
          if(!okUserId) return;
          const items = getItems(); const it = items.find(x=>x.id===item.id); it.isForSale = !it.isForSale; setItems(items); renderRoute();
        });
      };
      $('#editItem').onclick = () => {
        requireAuthForAction(item.owner, (okUserId) => { if(okUserId) location.hash = '#/create-item?edit=' + item.id; });
      };
      $('#deleteItem').onclick = () => {
        requireAuthForAction(item.owner, (okUserId) => {
          if(!okUserId) return;
          confirmModal('Excluir item', 'Excluir este item permanentemente?').then(confirmed => {
            if(!confirmed) return;
            setItems(getItems().filter(x => x.id !== item.id));
            showToast('Item excluído');
            location.hash = '#/items';
          });
        });
      };
    }
  
    function renderUserPage(id){
      const user = getUsers().find(x => x.id === id);
      if(!user) return renderNotFound();
      const tpl = document.getElementById('tpl-user').content.cloneNode(true);
      $('#view').appendChild(tpl);
  
      const avatarSrc = user.avatarUrl || makeAutoAvatar(user.displayName || user.username);
      $('#user-avatar').textContent = ''; // avatar area will show initials by default; keep simple
      $('#user-avatar').style.backgroundImage = `url("${avatarSrc}")`;
      $('#user-avatar').style.backgroundSize = 'cover';
      $('#user-avatar').style.backgroundPosition = 'center';
      $('#user-name').textContent = user.displayName || user.username;
      $('#user-name2').textContent = user.displayName || user.username;
      $('#user-bio').textContent = user.bio || '';
      $('#editProfile').href = '#/create-user?edit=' + user.id;
  
      const items = getItems().filter(i => i.owner === user.id);
      $('#user-items').innerHTML = items.map(i => cardHtml(i)).join('');
      bindCardClicks();
    }
  
    /* Form handlers with auth and confirmation */
    async function renderItemForm(){
      const tpl = document.getElementById('tpl-form-item').content.cloneNode(true);
      $('#view').appendChild(tpl);
      populateOwnerSelect();
  
      const params = parseHash().params;
      const editId = params.get('edit');
      const form = $('#itemForm');
  
      if(editId){
        const it = getItems().find(x=>x.id===editId);
        if(it){
          $('#form-title').textContent = 'Editar item';
          form.title.value = it.title;
          form.description.value = it.description;
          form.rarity.value = it.rarity;
          form.condition.value = it.condition;
          form.dateAcquired.value = it.dateAcquired || '';
          form.image.value = (it.images && it.images[0]) || '';
          form.owner.value = it.owner;
          form.isForSale.checked = !!it.isForSale;
          form.price.value = it.price || 0;
          form.onsubmit = async e => {
            e.preventDefault();
            // must be owner to edit
            const ok = await requireAuthForAction(it.owner);
            if(!ok) return;
            const data = new FormData(form);
            it.title = data.get('title');
            it.description = data.get('description');
            it.rarity = data.get('rarity');
            it.condition = data.get('condition');
            it.dateAcquired = data.get('dateAcquired');
            it.images = data.get('image') ? [data.get('image')] : [];
            it.owner = data.get('owner');
            it.isForSale = data.get('isForSale') === 'on';
            it.price = parseFloat(data.get('price')) || 0;
            setItems(getItems().map(x => x.id === it.id ? it : x));
            showToast('Item atualizado');
            location.hash = '#/items/' + it.id;
          };
        }
      } else {
        // preselect current user
        const cur = getCurrentUser();
        if(cur) {
          setTimeout(()=> { const sel = $('#ownerSelect'); if(sel) sel.value = cur.id; }, 60);
        }
        form.onsubmit = async e => {
          e.preventDefault();
          const data = new FormData(form);
          const obj = {
            id: uid('it'),
            title: data.get('title'),
            description: data.get('description'),
            rarity: data.get('rarity'),
            condition: data.get('condition'),
            dateAcquired: data.get('dateAcquired'),
            images: data.get('image') ? [data.get('image')] : [],
            owner: data.get('owner') || null,
            isForSale: data.get('isForSale') === 'on',
            price: parseFloat(data.get('price')) || 0,
            likes: 0,
            createdAt: Date.now()
          };
          const items = getItems(); items.unshift(obj); setItems(items);
          showToast('Item criado');
          location.hash = '#/items/' + obj.id;
        };
      }
    }
  
    function populateOwnerSelect(){
      const sel = $('#ownerSelect');
      const users = getUsers();
      sel.innerHTML = users.length ? users.map(u => `<option value="${u.id}">${safe(u.displayName||u.username)}</option>`).join('') : `<option value="">Nenhum usuário — crie um perfil</option>`;
    }
  
    /* User create/edit form with confirmation and password handling */
    async function renderUserForm(){
      const tpl = document.getElementById('tpl-form-user').content.cloneNode(true);
      $('#view').appendChild(tpl);
      const params = parseHash().params;
      const editId = params.get('edit');
      const form = $('#userForm');
  
      if(editId){
        // editing an existing profile: require owner auth if it's current user, else allow editing but protect saving (we require password of that account)
        const u = getUsers().find(x=>x.id===editId);
        if(u){
          $('#form-user-title').textContent = 'Editar Perfil';
          form.username.value = u.username;
          form.displayName.value = u.displayName;
          form.bio.value = u.bio;
          form.avatarUrl.value = u.avatarUrl;
          form.onsubmit = async e => {
            e.preventDefault();
            // require password for that account
            const ok = await requireAuthForAction(u.id);
            if(!ok) return;
            u.username = form.username.value;
            u.displayName = form.displayName.value;
            u.bio = form.bio.value;
            u.avatarUrl = form.avatarUrl.value;
            setUsers(getUsers().map(x => x.id === u.id ? u : x));
            // if editing own profile, ensure current session still points to user
            if(getCurrentUserId() === u.id) setCurrentUserId(u.id);
            showToast('Perfil salvo');
            location.hash = '#/users/' + u.id;
          };
        }
      } else {
        // create new profile: confirm, ask password, save credentials and set session
        form.onsubmit = async e => {
          e.preventDefault();
          const confirmCreate = await confirmModal('Criar perfil', 'Deseja criar este perfil agora? Será necessário definir uma senha para proteger seu perfil.');
          if(!confirmCreate) return;
          // ask password twice
          const pass1 = await promptModal('Defina uma senha (mínimo 4 caracteres)', 'senha', 'password');
          if(!pass1 || pass1.length < 4){ showToast('Senha inválida (mínimo 4 caracteres)'); return; }
          const pass2 = await promptModal('Confirme a senha', 'confirme a senha', 'password');
          if(pass2 !== pass1){ showToast('Senhas não conferem'); return; }
          const pwHash = await sha256Hex(pass1);
          const obj = { id: uid('u'), username: form.username.value.trim(), displayName: form.displayName.value.trim(), bio: form.bio.value.trim(), avatarUrl: form.avatarUrl.value.trim(), createdAt: Date.now() };
          const users = getUsers(); users.push(obj); setUsers(users);
          const creds = getCredentials(); creds[obj.id] = pwHash; setCredentials(creds);
          // set as current user
          setCurrentUserId(obj.id);
          updateNavForSession();
          showToast('Perfil criado e logado');
          location.hash = '#/users/' + obj.id;
        };
      }
    }
  
    /* Auth flow for actions that require ownership: returns true if ok */
    async function requireAuthForAction(resourceOwnerId, callback){
      // If no owner specified, disallow
      if(!resourceOwnerId){ showToast('Ação não permitida: sem proprietário.'); return false; }
      const currentId = getCurrentUserId();
      if(currentId && currentId === resourceOwnerId){
        // current user is owner: check credentials exist
        const creds = getCredentials();
        if(creds && creds[currentId]){
          // ask to re-enter password to confirm (revalidation)
          const input = await promptModal('Confirme sua senha para prosseguir', 'senha', 'password');
          if(!input){ showToast('Ação cancelada'); return false; }
          const h = await sha256Hex(input);
          if(h === creds[currentId]){ if(callback) callback(currentId); return true; }
          else { showToast('Senha incorreta'); return false; }
        } else {
          // no password set for this user — require set (edge case)
          showToast('Conta sem senha. Edite seu perfil e defina uma senha.');
          return false;
        }
      } else {
        // not logged in as owner — ask to login as owner
        const login = await loginModal(); if(!login){ showToast('Login cancelado'); return false; }
        // find user by username or id
        const users = getUsers();
        const found = users.find(u => u.id === login.usernameOrId || (u.username && u.username.toLowerCase() === login.usernameOrId.toLowerCase()));
        if(!found){ showToast('Usuário não encontrado'); return false; }
        const creds = getCredentials(); const stored = creds[found.id];
        if(!stored){ showToast('Conta sem senha. Ação não permitida.'); return false; }
        const h = await sha256Hex(login.password);
        if(h !== stored){ showToast('Senha incorreta'); return false; }
        // successful login as found user — set session and allow if user is resource owner
        setCurrentUserId(found.id);
        updateNavForSession();
        if(found.id !== resourceOwnerId){ showToast('Você não é o proprietário deste recurso'); return false; }
        if(callback) callback(found.id);
        return true;
      }
    }
  
    /* Card html */
    function cardHtml(i){
      const owner = getUsers().find(u => u.id === i.owner) || {};
      const price = i.isForSale ? ` • À venda R$ ${i.price}` : '';
      const img = (i.images && i.images[0]) || placeholderFor(i.title);
      return `<article class="card" data-id="${i.id}">
        <img src="${img}" alt="${escapeHtml(i.title)}" />
        <div>
          <h4><a href="#/items/${i.id}" style="color:inherit;text-decoration:none">${escapeHtml(i.title)}</a></h4>
          <p class="muted">${escapeHtml(owner.displayName || owner.username || '—')}</p>
          <p class="muted">${i.rarity} • ${i.condition}${price}</p>
        </div>
      </article>`;
    }
  
    function placeholderFor(title){
      return 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?q=60&w=1200&auto=format&fit=crop&crop=entropy';
    }
    function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  
    /* Click bindings and search (kept) */
    function bindCardClicks(){
      qs('.card').forEach(c => c.onclick = (e) => { const id = c.dataset.id; if(id) location.hash = '#/items/' + id; });
      qs('.brand').forEach(b => b.onclick = ()=> location.hash = '#/');
    }
  
    function bindSearch(){
      const inpt = $('#search');
      if(!inpt) return;
      inpt.oninput = debounce(e => {
        const q = e.target.value.trim().toLowerCase();
        if(!q) return;
        const users = getUsers();
        const items = getItems();
        const u = users.find(x => (x.username||'').toLowerCase().includes(q) || (x.displayName||'').toLowerCase().includes(q));
        const it = items.find(x => (x.title||'').toLowerCase().includes(q));
        if(u) location.hash = '#/users/' + u.id;
        else if(it) location.hash = '#/items/' + it.id;
        else {
          location.hash = '#/items';
          setTimeout(() => {
            const list = getItems().filter(x => (x.title||'').toLowerCase().includes(q) || (x.description||'').toLowerCase().includes(q));
            $('#itemsList') && ($('#itemsList').innerHTML = list.map(i => cardHtml(i)).join(''), bindCardClicks());
          }, 120);
        }
      }, 300);
    }
  
    function debounce(fn, delay=250){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=> fn(...a), delay); }; }
  
    /* Export data */
    function exportData(){
      const data = { users: getUsers(), items: getItems(), credentials: getCredentials(), currentUser: getCurrentUserId() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'arcana-data.json'; a.click(); URL.revokeObjectURL(url);
    }
  
    /* UI binding for nav controls */
    $('#seedReset').onclick = ()=> { if(confirm('Restaurar dados iniciais? Isso apagará alterações locais.')) seed(); };
    $('#exportData').onclick = exportData;
    $('#navLogout').onclick = (e) => { e.preventDefault(); setCurrentUserId(null); showToast('Você saiu'); location.hash = '#/'; };
  
    /* Initial setup */
    if(!read(USERS_KEY) || !read(ITEMS_KEY)) seed();
    updateNavForSession();
    window.addEventListener('hashchange', renderRoute);
    window.addEventListener('load', renderRoute);
  
    // Modal close handlers
    document.addEventListener('click', (ev) => { if(ev.target === $('#modal')) closeModal(); });
    document.addEventListener('keydown', (ev) => { if(ev.key === 'Escape') closeModal(); });
  
  })();
  