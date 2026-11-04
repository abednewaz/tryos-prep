/* TRYOS Prep accounts and community reviews. Supabase anon key only. */
(function () {
  const AUTH = {
    ready: false,
    configured: false,
    sb: null,
    session: null,
    profile: null,
    recovery: false,
    menu: false,
    reviews: [],
    offset: 0,
    done: false,
    mine: null,
    msg: "",
    err: "",
    busy: false,
    file: null
  };
  const PAGE = 6;
  const MAX = 500;

  function t() { return tx(); }
  function e(s) { return esc(String(s ?? "")); }
  function uid() { return AUTH.session && AUTH.session.user && AUTH.session.user.id; }
  function emailOf() { return (AUTH.session && AUTH.session.user && AUTH.session.user.email) || ""; }

  function origin() { return location.origin + "/"; }

  async function loadConfig() {
    let cfg = window.TRYOS_SUPABASE || {};
    try {
      const r = await fetch("/api/public-config", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.url && j.anonKey) cfg = j;
      }
    } catch (err) {}
    if (!cfg.url || !cfg.anonKey) return null;
    return cfg;
  }

  async function refreshProfile() {
    AUTH.profile = null;
    AUTH.mine = null;
    if (!AUTH.sb || !uid()) return;
    const { data } = await AUTH.sb.from("profiles").select("id,display_name,avatar_path,created_at").eq("id", uid()).maybeSingle();
    AUTH.profile = data || null;
    const mine = await AUTH.sb.from("reviews").select("id,review_text,created_at,updated_at").eq("user_id", uid()).maybeSingle();
    AUTH.mine = mine.data || null;
  }

  async function init() {
    const cfg = await loadConfig();
    AUTH.ready = true;
    if (!cfg || !window.supabase) {
      AUTH.configured = false;
      if (window.render) render();
      return;
    }
    AUTH.sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" }
    });
    AUTH.configured = true;
    const hash = location.hash || "";
    if (/type=recovery/.test(hash)) AUTH.recovery = true;
    const { data } = await AUTH.sb.auth.getSession();
    AUTH.session = data.session || null;
    AUTH.sb.auth.onAuthStateChange(function (event, session) {
      AUTH.session = session;
      if (event === "PASSWORD_RECOVERY") {
        AUTH.recovery = true;
        if (window.go) go("authReset");
        return;
      }
      refreshProfile().then(function () { if (window.render) render(); });
    });
    await refreshProfile();
    if (AUTH.recovery && window.go) go("authReset");
    else if (window.render) render();
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
    return e(parts.map(function (s) { return s.charAt(0); }).join("").toUpperCase() || "?");
  }

  function avatarURL(path) {
    if (!path || !AUTH.sb) return "";
    const pub = AUTH.sb.storage.from("avatars").getPublicUrl(path);
    return (pub.data && pub.data.publicUrl) ? pub.data.publicUrl + "?t=" + encodeURIComponent(path) : "";
  }

  function face(path, name, cls) {
    const src = avatarURL(path);
    if (src) return '<img class="' + (cls || "ph") + '" src="' + e(src) + '" alt="">';
    return '<span class="' + (cls || "ph") + '" aria-hidden="true">' + initials(name) + "</span>";
  }

  function when(iso) {
    if (!iso) return "";
    const lang = (S.lang === "bn") ? "bn-BD" : (S.lang === "tr") ? "tr-TR" : "en";
    try { return new Date(iso).toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" }); }
    catch (err) { return iso.slice(0, 10); }
  }

  function needConfig() {
    const tr = t();
    return '<div class="narrow"><p class="eyebrow">Account</p><h1 class="page">' + e(tr.signIn || "Sign in") + '</h1><p class="note">' + e(tr.authNeedConfig || "Add your Supabase URL and anon key before accounts can work.") + "</p></div>";
  }

  function field(label, name, type, value, extra) {
    return '<label>' + e(label) + '<input name="' + name + '" type="' + type + '" value="' + e(value || "") + '" ' + (extra || "") + " required></label>";
  }

  function banner() {
    let h = "";
    if (AUTH.err) h += '<p class="err" role="alert">' + e(AUTH.err) + "</p>";
    if (AUTH.msg) h += '<p class="okmsg" role="status">' + e(AUTH.msg) + "</p>";
    return h;
  }

  function headerHTML() {
    const tr = t();
    if (!AUTH.ready) return "";
    if (uid() && AUTH.profile) {
      return '<div class="acct"><button type="button" class="avatar-btn" data-auth="menu" aria-haspopup="true" aria-expanded="' + (AUTH.menu ? "true" : "false") + '" aria-label="' + e(tr.accountMenu || "Account") + '">' + face(AUTH.profile.avatar_path, AUTH.profile.display_name, "av") + "</button>" +
        (AUTH.menu ? '<div class="menu" role="menu"><button type="button" data-auth="profile" data-user="' + e(uid()) + '">' + e(tr.myProfile) + '</button><button type="button" data-auth="account">' + e(tr.accountSettings) + '</button><button type="button" data-auth="myreviews">' + e(tr.myReviews) + '</button><button type="button" data-auth="logout">' + e(tr.logOut) + "</button></div>" : "") +
        "</div>";
    }
    return '<div class="acct wide-auth"><button type="button" class="signin-link" data-auth="signin">' + e(tr.signIn) + '</button><button type="button" class="signup-btn" data-auth="signup">' + e(tr.signUp) + '</button></div>' +
      '<div class="acct compact-auth"><button type="button" class="avatar-btn" data-auth="menu" aria-label="' + e(tr.accountMenu || "Account") + '"><span class="ph">+</span></button>' +
      (AUTH.menu ? '<div class="menu" role="menu"><button type="button" data-auth="signin">' + e(tr.signIn) + '</button><button type="button" data-auth="signup">' + e(tr.signUp) + "</button></div>" : "") +
      "</div>";
  }

  function shell(title, inner) {
    const tr = t();
    return '<div class="narrow"><button class="back" type="button" data-go="home">← ' + e(tr.back) + '</button><p class="eyebrow" style="margin-top:24px">Account</p><h1 class="page">' + e(title) + "</h1>" + banner() + inner + "</div>";
  }

  function view(name) {
    const tr = t();
    if (!AUTH.configured) return needConfig();
    if (name === "signin") {
      return shell(tr.signIn, '<form class="form" data-authform="signin">' + field(tr.email, "email", "email", "", 'autocomplete="email"') + field(tr.password, "password", "password", "", 'autocomplete="current-password" minlength="8"') + '<button class="btn" type="submit"' + (AUTH.busy ? " disabled" : "") + ">" + e(tr.signIn) + '</button></form><p class="note"><button type="button" class="back" data-auth="forgot">' + e(tr.forgot) + '</button></p><p class="note">' + e(tr.needAccount) + ' <button type="button" class="back" data-auth="signup">' + e(tr.signUp) + "</button></p>");
    }
    if (name === "signup") {
      return shell(tr.signUp, '<form class="form" data-authform="signup">' + field(tr.displayName, "name", "text", "", 'minlength="2" maxlength="32" autocomplete="nickname"') + field(tr.email, "email", "email", "", 'autocomplete="email"') + field(tr.password, "password", "password", "", 'autocomplete="new-password" minlength="8"') + field(tr.confirmPassword, "confirm", "password", "", 'autocomplete="new-password" minlength="8"') + '<button class="btn" type="submit"' + (AUTH.busy ? " disabled" : "") + ">" + e(tr.createAccount) + "</button></form><p class=\"note\">" + e(tr.haveAccount) + ' <button type="button" class="back" data-auth="signin">' + e(tr.signIn) + "</button></p>");
    }
    if (name === "forgot") {
      return shell(tr.forgot, '<form class="form" data-authform="forgot">' + field(tr.email, "email", "email", "", 'autocomplete="email"') + '<button class="btn" type="submit"' + (AUTH.busy ? " disabled" : "") + ">" + e(tr.sendReset) + "</button></form>");
    }
    if (name === "reset") {
      if (!AUTH.session) return shell(tr.newPassword, '<p class="note">' + e(tr.resetNeedLink) + '</p><button class="btn" type="button" data-auth="forgot">' + e(tr.forgot) + "</button>");
      return shell(tr.newPassword, '<form class="form" data-authform="reset">' + field(tr.newPassword, "password", "password", "", 'autocomplete="new-password" minlength="8"') + field(tr.confirmPassword, "confirm", "password", "", 'minlength="8"') + '<button class="btn" type="submit"' + (AUTH.busy ? " disabled" : "") + ">" + e(tr.save) + "</button></form>");
    }
    if (name === "account") {
      if (!uid()) return shell(tr.accountSettings, '<p class="note">' + e(tr.needSignIn) + '</p><button class="btn" type="button" data-auth="signin">' + e(tr.signIn) + "</button>");
      const p = AUTH.profile || {};
      return shell(tr.accountSettings,
        '<section class="about-card" style="margin-top:18px"><p class="eyebrow">' + e(tr.profile) + "</p>" +
        '<div class="who" style="margin-top:12px">' + face(p.avatar_path, p.display_name, "ph lg") + '<img id="avatarPreview" alt="" hidden class="ph lg"></div>' +
        '<form class="form" data-authform="profile">' + field(tr.displayName, "name", "text", p.display_name || "", 'minlength="2" maxlength="32"') +
        '<label>' + e(tr.avatar) + '<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></label>' +
        '<div class="mrow"><button class="btn" type="submit"' + (AUTH.busy ? " disabled" : "") + ">" + e(tr.save) + '</button><button class="btn ghost" type="button" data-go="account">' + e(tr.cancel) + "</button></div></form></section>" +
        '<section class="about-card" style="margin-top:14px"><p class="eyebrow">' + e(tr.email) + "</p><p style=\"margin-top:8px\">" + e(emailOf()) + "</p><p class=\"note\">" + e(tr.emailHint) + "</p>" +
        '<form class="form" data-authform="email">' + field(tr.email, "email", "email", "", 'autocomplete="email"') + field(tr.password, "password", "password", "", 'autocomplete="current-password"') + '<button class="btn" type="submit">' + e(tr.changeEmail) + "</button></form></section>" +
        '<section class="about-card" style="margin-top:14px"><p class="eyebrow">' + e(tr.password) + "</p><p class=\"note\">" + e(tr.passwordHint) + "</p>" +
        '<form class="form" data-authform="password">' + field(tr.password, "current", "password", "", 'autocomplete="current-password"') + field(tr.newPassword, "password", "password", "", 'autocomplete="new-password" minlength="8"') + field(tr.confirmPassword, "confirm", "password", "", 'minlength="8"') + '<button class="btn" type="submit">' + e(tr.changePassword) + '</button></form><p class="note"><button type="button" class="back" data-auth="forgot">' + e(tr.forgot) + "</button></p></section>" +
        '<section class="about-card" style="margin-top:14px"><p class="eyebrow">' + e(tr.accountStatus) + "</p><p style=\"margin-top:8px\">" + e(tr.memberSince) + " " + e(when(p.created_at)) + '</p><button class="btn ghost" type="button" style="margin-top:14px" data-auth="logout">' + e(tr.logOut) + "</button></section>");
    }
    if (name === "profile") return '<div class="narrow" id="profileRoot"><p class="muted">' + e(tr.loading || "Loading") + "</p></div>";
    if (name === "myreviews") {
      if (!uid()) return shell(tr.myReviews, '<button class="btn" type="button" data-auth="signin">' + e(tr.signIn) + "</button>");
      const mine = AUTH.mine;
      return shell(tr.myReviews, mine
        ? '<article class="rcard">' + e(mine.review_text) + '<p class="note">' + e(when(mine.created_at)) + '</p><div class="mrow" style="margin-top:12px"><button class="btn" type="button" data-auth="composer">' + e(tr.editReview) + '</button><button class="btn ghost" type="button" data-auth="delete-review">' + e(tr.deleteReview) + "</button></div></article>"
        : '<p class="note">' + e(tr.noReviews) + '</p><button class="btn" type="button" data-auth="composer">' + e(tr.writeReview) + "</button>");
    }
    return "";
  }

  function reviewsSection() {
    const tr = t();
    return '<section class="reviews-sec" id="reviews"><p class="eyebrow">' + e(tr.community) + '</p><div class="review-head"><h2>' + e(tr.reviewsTitle) + '</h2><button class="btn" type="button" data-auth="composer">' + e(tr.writeReview) + '</button></div><div id="reviewComposer"></div><div class="review-grid" id="reviewGrid">' + (AUTH.configured ? '<span class="sk" style="height:92px"></span><span class="sk" style="height:92px"></span>' : '<p class="note">' + e(tr.authNeedConfig) + "</p>") + '</div><button class="btn ghost" type="button" id="reviewMore" data-auth="more" hidden>' + e(tr.loadMore) + "</button></section>";
  }

  function card(r) {
    const tr = t();
    const verified = r.email_verified ? '<span class="verified">' + e(tr.verified) + "</span>" : "";
    return '<article class="rcard"><button type="button" class="who" data-auth="profile" data-user="' + e(r.user_id) + '">' + face(r.avatar_path, r.display_name, "ph") + '<span><b>' + e(r.display_name) + "</b>" + verified + '<span class="note">' + e(when(r.created_at)) + "</span></span></button><p>" + e(r.review_text) + "</p></article>";
  }

  async function loadReviews(reset) {
    const grid = document.getElementById("reviewGrid");
    if (!grid || !AUTH.sb) return;
    if (reset) { AUTH.offset = 0; AUTH.reviews = []; AUTH.done = false; }
    const { data, error } = await AUTH.sb.rpc("public_reviews", { lim: PAGE, off: AUTH.offset });
    if (error) {
      grid.innerHTML = '<p class="err">' + e(error.message) + "</p>";
      return;
    }
    const rows = data || [];
    if (reset) AUTH.reviews = rows; else AUTH.reviews = AUTH.reviews.concat(rows);
    AUTH.offset += rows.length;
    AUTH.done = rows.length < PAGE;
    grid.innerHTML = AUTH.reviews.length ? AUTH.reviews.map(card).join("") : '<p class="note">' + e(t().noReviews) + "</p>";
    const more = document.getElementById("reviewMore");
    if (more) more.hidden = AUTH.done || !AUTH.reviews.length;
  }

  async function showProfile() {
    const root = document.getElementById("profileRoot");
    if (!root || !AUTH.sb) return;
    const id = (route && route.user) || uid();
    const tr = t();
    if (!id) { root.innerHTML = '<p class="note">' + e(tr.needSignIn) + "</p>"; return; }
    const { data, error } = await AUTH.sb.rpc("public_profile", { uid: id });
    if (error || !data || !data[0]) { root.innerHTML = '<p class="err">' + e((error && error.message) || tr.notReady) + "</p>"; return; }
    const p = data[0];
    const { data: revs } = await AUTH.sb.from("reviews").select("review_text,created_at").eq("user_id", id).order("created_at", { ascending: false });
    const list = (revs || []).map(function (r) { return '<article class="rcard"><p>' + e(r.review_text) + '</p><p class="note">' + e(when(r.created_at)) + "</p></article>"; }).join("") || '<p class="note">' + e(tr.noReviews) + "</p>";
    root.innerHTML = '<button class="back" type="button" data-go="home">← ' + e(tr.back) + '</button><div class="about-card" style="margin-top:18px"><div class="who">' + face(p.avatar_path, p.display_name, "ph lg") + '<div><h1 class="page" style="font-size:32px">' + e(p.display_name) + "</h1><p class=\"note\">" + e(tr.memberSince) + " " + e(when(p.joined_at)) + (p.email_verified ? " · " + e(tr.verified) : "") + "</p></div></div></div><h2 style=\"margin-top:22px\">" + e(tr.reviewsTitle) + "</h2>" + list;
  }

  function composer() {
    const box = document.getElementById("reviewComposer");
    if (!box) return;
    const tr = t();
    if (!uid()) { box.innerHTML = ""; return; }
    const text = AUTH.mine ? AUTH.mine.review_text : "";
    box.innerHTML = '<form class="form" data-authform="review"><label>' + e(tr.reviewPlaceholder) + '<textarea name="text" maxlength="' + MAX + '" required>' + e(text) + '</textarea></label><p class="note"><span id="ccount">' + text.length + "</span> / " + MAX + '</p><button class="btn" type="submit">' + e(AUTH.mine ? tr.editReview : tr.writeReview) + "</button></form>";
    const reviewForm = box.querySelector('form[data-authform="review"]');
    if (reviewForm) {
      // This form is created dynamically after the page's normal render hooks.
      // Attach its submit handler here so the browser does not reload the page.
      reviewForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        onSubmit(reviewForm);
      });
    }
    const ta = box.querySelector("textarea");
    if (ta) ta.addEventListener("input", function () { const c = document.getElementById("ccount"); if (c) c.textContent = String(ta.value.length); });
  }

  function afterRender() {
    const root = document.getElementById("acct");
    if (root) root.innerHTML = headerHTML();
    if (document.getElementById("reviewGrid")) loadReviews(true);
    if (document.getElementById("profileRoot")) showProfile();
    document.querySelectorAll("form[data-authform]").forEach(function (f) {
      f.addEventListener("submit", function (ev) { ev.preventDefault(); onSubmit(f); });
    });
    const file = document.querySelector('input[name="avatar"]');
    if (file) file.addEventListener("change", function () {
      const pic = file.files && file.files[0];
      const prev = document.getElementById("avatarPreview");
      if (!pic || !prev) return;
      if (!/^image\/(jpeg|png|webp)$/.test(pic.type) || pic.size > 2 * 1024 * 1024) {
        AUTH.err = t().avatarInvalid;
        AUTH.file = null;
        render();
        return;
      }
      AUTH.file = pic;
      prev.hidden = false;
      prev.src = URL.createObjectURL(pic);
    });
  }

  function fail(error) {
    const msg = (error && error.message) || "Error";
    if (/slow_down/i.test(msg)) return t().wait || msg;
    if (/duplicate|unique/i.test(msg)) return t().nameTaken || msg;
    return msg;
  }

  async function onSubmit(form) {
    if (!AUTH.sb || AUTH.busy) return;
    AUTH.busy = true; AUTH.err = ""; AUTH.msg = "";
    const fd = new FormData(form);
    const kind = form.getAttribute("data-authform");
    const tr = t();
    try {
      if (kind === "signin") {
        const { error } = await AUTH.sb.auth.signInWithPassword({ email: String(fd.get("email") || "").trim(), password: String(fd.get("password") || "") });
        if (error) throw error;
        await refreshProfile();
        const next = AUTH.after || "home";
        AUTH.after = "";
        go(next === "review" ? "home" : next);
        if (next === "review") setTimeout(composer, 0);
        return;
      }
      if (kind === "signup") {
        const name = String(fd.get("name") || "").trim();
        const password = String(fd.get("password") || "");
        const confirm = String(fd.get("confirm") || "");
        if (!/^[A-Za-z0-9_ ]{2,32}$/.test(name)) throw new Error(tr.nameRule);
        if (password.length < 8) throw new Error(tr.weakPassword);
        if (password !== confirm) throw new Error(tr.mismatch);
        const { data, error } = await AUTH.sb.auth.signUp({
          email: String(fd.get("email") || "").trim(),
          password: password,
          options: { emailRedirectTo: location.origin + "/login", data: { display_name: name } }
        });
        if (error) throw error;
        AUTH.msg = data.session ? tr.signedIn : tr.checkEmail;
        AUTH.session = data.session;
        await refreshProfile();
      }
      if (kind === "forgot") {
        const { error } = await AUTH.sb.auth.resetPasswordForEmail(String(fd.get("email") || "").trim(), { redirectTo: location.origin + "/reset-password" });
        if (error) throw error;
        AUTH.msg = tr.resetSent;
      }
      if (kind === "reset") {
        const password = String(fd.get("password") || "");
        if (password.length < 8) throw new Error(tr.weakPassword);
        if (password !== String(fd.get("confirm") || "")) throw new Error(tr.mismatch);
        const { error } = await AUTH.sb.auth.updateUser({ password: password });
        if (error) throw error;
        AUTH.recovery = false;
        AUTH.msg = tr.passwordSaved;
        history.replaceState(null, "", location.pathname);
      }
      if (kind === "profile") {
        const name = String(fd.get("name") || "").trim();
        if (!/^[A-Za-z0-9_ ]{2,32}$/.test(name)) throw new Error(tr.nameRule);
        const { error } = await AUTH.sb.from("profiles").update({ display_name: name }).eq("id", uid());
        if (error) throw error;
        if (AUTH.file) {
          const ext = AUTH.file.type === "image/png" ? "png" : AUTH.file.type === "image/webp" ? "webp" : "jpg";
          const path = uid() + "/avatar." + ext;
          const up = await AUTH.sb.storage.from("avatars").upload(path, AUTH.file, { upsert: true, contentType: AUTH.file.type });
          if (up.error) throw up.error;
          const saved = await AUTH.sb.from("profiles").update({ avatar_path: path }).eq("id", uid());
          if (saved.error) throw saved.error;
          AUTH.file = null;
        }
        AUTH.msg = tr.saved;
        await refreshProfile();
      }
      if (kind === "email") {
        const next = String(fd.get("email") || "").trim();
        const { error: re } = await AUTH.sb.auth.signInWithPassword({ email: emailOf(), password: String(fd.get("password") || "") });
        if (re) throw re;
        const { error } = await AUTH.sb.auth.updateUser({ email: next }, { emailRedirectTo: location.origin + "/account" });
        if (error) throw error;
        AUTH.msg = tr.emailSent;
      }
      if (kind === "password") {
        const password = String(fd.get("password") || "");
        if (password.length < 8) throw new Error(tr.weakPassword);
        if (password !== String(fd.get("confirm") || "")) throw new Error(tr.mismatch);
        const { error: re } = await AUTH.sb.auth.signInWithPassword({ email: emailOf(), password: String(fd.get("current") || "") });
        if (re) throw re;
        const { error } = await AUTH.sb.auth.updateUser({ password: password });
        if (error) throw error;
        AUTH.msg = tr.passwordSaved;
      }
      if (kind === "review") {
        const text = String(fd.get("text") || "").trim();
        if (!text || text.length > MAX) throw new Error(tr.tooLong);
        const last = Number(localStorage.getItem("tryos-review-at") || 0);
        if (Date.now() - last < 15000) throw new Error("slow_down");
        let error;
        if (AUTH.mine) error = (await AUTH.sb.from("reviews").update({ review_text: text }).eq("user_id", uid())).error;
        else error = (await AUTH.sb.from("reviews").insert({ user_id: uid(), review_text: text })).error;
        if (error) throw error;
        localStorage.setItem("tryos-review-at", String(Date.now()));
        AUTH.msg = tr.reviewSaved;
        await refreshProfile();
      }
    } catch (error) {
      AUTH.err = fail(error);
    } finally {
      AUTH.busy = false;
    }
    if (window.render) render();
  }

  async function onClick(d) {
    AUTH.err = "";
    if (d.auth === "menu") { AUTH.menu = !AUTH.menu; afterRender(); return; }
    AUTH.menu = false;
    if (d.auth === "signin") return go("authSignIn");
    if (d.auth === "signup") return go("authSignUp");
    if (d.auth === "forgot") return go("authForgot");
    if (d.auth === "account") return go("account");
    if (d.auth === "myreviews") return go("myReviews");
    if (d.auth === "profile") return go("profile", { user: d.user || uid() });
    if (d.auth === "logout") {
      if (AUTH.sb) await AUTH.sb.auth.signOut();
      AUTH.session = null; AUTH.profile = null; AUTH.mine = null;
      return go("home");
    }
    if (d.auth === "more") return loadReviews(false);
    if (d.auth === "composer") {
      if (!uid()) { AUTH.after = "review"; return go("authSignIn"); }
      composer();
      const box = document.getElementById("reviewComposer");
      if (box) box.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (d.auth === "delete-review") {
      if (!AUTH.mine || !confirm(t().deleteAsk || "Delete this review?")) return;
      const { error } = await AUTH.sb.from("reviews").delete().eq("user_id", uid());
      if (error) { AUTH.err = fail(error); return render(); }
      AUTH.mine = null;
      AUTH.msg = t().reviewDeleted;
      return render();
    }
  }

  document.addEventListener("click", function (ev) {
    if (!AUTH.menu) return;
    if (!ev.target.closest(".acct")) { AUTH.menu = false; afterRender(); }
  });

  window.TRYOSAuth = { init: init, headerHTML: headerHTML, view: view, reviewsSection: reviewsSection, afterRender: afterRender, onClick: onClick };
})();
