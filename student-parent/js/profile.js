// ============================================================
//  student/js/profile.js
//  Full profile page — all data from API
//  Expected API response shape:
//  {
//    success: true,
//    data: {
//      _id, name, email, mobile, gender, dob, rollNumber,
//      role, isActive, createdAt,
//      college:    { name },
//      department: { name },
//      address:    { street, city, state, pincode }
//    }
//  }
// ============================================================

const Profile = {
  _uploading: false,

  async load() {
    _el("profile-content").innerHTML = UI.skeleton(2, 80);
    try {
      const d = await API.student.profile();
      if (!d.success) throw new Error(d.message || "Failed");
      // Backend returns the flat student under `profile` (and `student`) —
      // `data` is a nested wrapper, not the profile fields themselves.
      this._render(d.profile || d.student || d.data);
    } catch (err) {
      _el("profile-content").innerHTML = UI.error(err.message);
    }
  },

  _render(u) {
    const initials = UI.initials(u.name);
    const dob = u.dob ? UI.date(u.dob) : "—";
    const joined = UI.date(u.createdAt);
    const address = u.address
      ? [u.address.street, u.address.city, u.address.state, u.address.pincode]
          .filter(Boolean)
          .join(", ")
      : "—";
    const isParent = window.SAL_USER && window.SAL_USER.role === "parent";

    _el("profile-content").innerHTML = `
      <div class="profile-card">

        <!-- Avatar + name -->
        <div class="profile-card__top">
          <div class="profile-avatar-wrap" style="position:relative;display:inline-block">
            ${
              u.avatar
                ? `<img src="${u.avatar}" alt="${u.name || "Profile photo"}" class="profile-avatar profile-avatar--img" id="profileAvatarImg">`
                : `<div class="profile-avatar" id="profileAvatarInitials">${initials}</div>`
            }
            ${
              isParent
                ? ""
                : `
              <label for="profilePhotoInput" class="profile-avatar__edit" title="Change photo"
                style="position:absolute;bottom:0;right:0;background:var(--clr-accent);color:#fff;border-radius:50%;
                       width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;
                       font-size:14px;border:2px solid var(--clr-surface)">✎</label>
              <input type="file" id="profilePhotoInput" accept="image/jpeg,image/png,image/webp" style="display:none"
                     onchange="Profile._onPhotoSelected(event)">
            `
            }
          </div>
          <div class="profile-card__name">${u.name || "—"}</div>
          <div class="profile-card__role">${UI.badge(isParent ? "Parent" : "Student", "primary")}</div>
          ${u.isActive === false ? UI.badge("Inactive", "danger") : ""}
          ${isParent ? '<p class="profile-card__hint" style="margin-top:6px">This is your linked student\'s profile. Only the student can change the photo.</p>' : ""}
          <div id="profilePhotoStatus" style="font-size:12px;color:var(--clr-text3);margin-top:6px"></div>
        </div>

        <!-- Info grid -->
        <div class="info-grid">
          ${this._row("Roll Number", u.rollNumber || u.roll || "—")}
          ${this._row("Email", u.email || "—")}
          ${this._row("Mobile", u.mobile || u.phone || "—")}
          ${this._row("Gender", _cap(u.gender) || "—")}
          ${this._row("Date of Birth", dob)}
          ${this._row("College", u.college?.name || "—")}
          ${this._row("Department", u.department?.name || "—")}
          ${this._row("Course", u.course || u.courseName || "—")}
          ${this._row("Semester", u.semester || u.sem || "—")}
          ${this._row("Address", address)}
          ${this._row("Joined On", joined)}
        </div>

        <p class="profile-card__hint">
          To update your password — logout and use <strong>Forgot Password</strong> on the login page.
        </p>
      </div>`;
  },

  // Reads the chosen file, downsizes it on a <canvas> (max 512px, JPEG ~0.82
  // quality) so we're not shipping multi-MB photos into the database, then
  // uploads the resulting data URI.
  async _onPhotoSelected(evt) {
    const file = evt.target.files && evt.target.files[0];
    evt.target.value = ""; // allow re-selecting the same file later
    if (!file || this._uploading) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      UI.toast
        ? UI.toast("Please choose a JPEG, PNG, or WEBP image.", "error")
        : alert("Please choose a JPEG, PNG, or WEBP image.");
      return;
    }
    this._uploading = true;
    const statusEl = _el("profilePhotoStatus");
    if (statusEl) statusEl.textContent = "Uploading…";
    try {
      const dataUri = await this._compressImage(file);
      const d = await API.student.uploadPhoto(dataUri);
      if (!d.success) throw new Error(d.message || "Upload failed");
      this._render(d.student || d.profile || d.data);
      if (window.SAL_USER) window.SAL_USER.avatar = dataUri;
      App._renderSidebarAvatar(dataUri, UI.initials(window.SAL_USER?.name || ""));
      UI.toast ? UI.toast("Profile photo updated.") : null;
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || "Upload failed.";
      else alert(err.message || "Upload failed.");
    } finally {
      this._uploading = false;
    }
  },

  // Compresses to a data URI under ~100KB (matching the server's limit).
  // Starts at 480px/0.8 quality and steps down quality, then dimensions,
  // until the result fits — most phone photos fit within the first 1-2 steps.
  async _compressImage(file) {
    const img = await this._loadImage(file);
    const MAX_BYTES = 100 * 1024;
    const attempts = [
      [480, 0.8],
      [480, 0.6],
      [360, 0.6],
      [360, 0.45],
      [280, 0.45],
      [280, 0.3],
      [200, 0.3],
      [160, 0.25],
    ];
    let last = null;
    for (const [maxDim, quality] of attempts) {
      const uri = this._drawToDataUri(img, maxDim, quality);
      last = uri;
      const approxBytes = Math.floor(uri.length * 0.75);
      if (approxBytes <= MAX_BYTES) return uri;
    }
    throw new Error(
      "This image is too detailed to compress under 100KB — please choose a simpler or smaller photo.",
    );
  },

  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new Error("Could not read the selected file."));
      reader.onload = () => {
        img.onerror = () =>
          reject(new Error("Could not read the selected image."));
        img.onload = () => resolve(img);
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _drawToDataUri(img, maxDim, quality) {
    let { width, height } = img;
    if (width > height && width > maxDim) {
      height = Math.round(height * (maxDim / width));
      width = maxDim;
    } else if (height > maxDim) {
      width = Math.round(width * (maxDim / height));
      height = maxDim;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  },
  _row(label, value) {
    return `
      <div class="info-row">
        <div class="info-row__label">${label}</div>
        <div class="info-row__value">${value}</div>
      </div>`;
  },
};

function _cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
