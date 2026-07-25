// teacher/js/profile.js — My Profile page (spec item 7)
// Photo upload + editing "existing editable fields only" (phone, emergency
// contact, qualification, experience). Designation/course/status stay
// HOD/Admin-controlled — see hod/js/modals.js Teacher Details for those.

const TeacherProfile = {
  _loaded: false,
  _uploading: false,

  async load() {
    const body = document.getElementById('page-profile');
    if (!body) return;
    try {
      const d = await TAPI.getProfile();
      if (!d.success) throw new Error(d.message || 'Failed to load profile');
      this._render(d.profile);
      this._loaded = true;
    } catch (e) {
      showToast(e.message || 'Could not load profile.', 'error');
    }
  },

  _render(u) {
    document.getElementById('profName').value = u.name || '';
    document.getElementById('profEmail').value = u.email || '';
    document.getElementById('profDesignation').value = u.designation || '';
    document.getElementById('profPhone').value = u.phone || '';
    document.getElementById('profEmergency').value = u.emergencyContact || '';
    document.getElementById('profQualification').value = u.qualification || '';
    document.getElementById('profExperience').value = u.experience || '';

    // Avatar: update shared state and let _applyIdentity() (app.js) paint
    // every avatar slot at once — sidebarAv, headerAv, sb-av, profAv — so
    // there's one place that owns "how an avatar renders", not four.
    currentTeacher.avatar = u.avatar || '';
    _applyIdentity();
  },

  // Note: profile details are now view-only (see index.html) — no save()
  // method for text fields anymore. Only onPhotoSelected() below can change
  // anything about this profile.


  onPhotoSelected(evt) {
    const file = evt.target.files && evt.target.files[0];
    evt.target.value = '';
    if (!file || this._uploading) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showToast('Please choose a JPEG, PNG, or WEBP image.', 'error');
      return;
    }
    this._uploading = true;
    const statusEl = document.getElementById('profPhotoStatus');  
    if (statusEl) statusEl.textContent = 'Uploading…';
    this._compressImage(file)
      .then(dataUri => TAPI.uploadPhoto(dataUri))
      .then(d => {
        if (!d.success) throw new Error(d.message || 'Upload failed');
        this._render(d.profile);
        if (statusEl) statusEl.textContent = '';
        showToast('Profile photo updated.');
      })
      .catch(e => { if (statusEl) statusEl.textContent = e.message || 'Upload failed.'; })
      .finally(() => { this._uploading = false; });
  },

  // Compresses to a data URI under ~100KB (matching the server's limit).
  async _compressImage(file) {
    const img = await this._loadImage(file);
    const MAX_BYTES = 100 * 1024;
    const attempts = [
      [480, 0.8], [480, 0.6], [360, 0.6], [360, 0.45],
      [280, 0.45], [280, 0.3], [200, 0.3], [160, 0.25],
    ];
    let last = null;
    for (const [maxDim, quality] of attempts) {
      const uri = this._drawToDataUri(img, maxDim, quality);
      last = uri;
      const approxBytes = Math.floor(uri.length * 0.75);
      if (approxBytes <= MAX_BYTES) return uri;
    }
    throw new Error('This image is too detailed to compress under 100KB — please choose a simpler or smaller photo.');
  },

  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.onload = () => {
        img.onerror = () => reject(new Error('Could not read the selected image.'));
        img.onload = () => resolve(img);
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _drawToDataUri(img, maxDim, quality) {
    let { width, height } = img;
    if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
    else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  },
};
