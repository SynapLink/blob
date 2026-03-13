// app.js

const GITHUB_API_URL = 'https://api.github.com';
let currentUser = null;
let currentToken = null;

function initApp() {
    // Check if coming back from OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        // In a real OAuth flow without exposing secrets, you'd send this `code` to a Cloudflare Worker
        // which exchanges it for a token and returns it.
        // For testing/mocking purposes before the backend is setup, we'll prompt the user directly or use a PAT
        console.log("Got OAuth code:", code);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check localStorage for token
    currentToken = localStorage.getItem('pastebin_gh_token');
    
    // Bind generic auth UI
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLoginClick);
    }

    if (document.getElementById('logoutLink')) {
        document.getElementById('logoutLink').addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    if (currentToken) {
        fetchUserProfile();
    } else {
        updateAuthUI(false);
    }
}

function handleLoginClick() {
    // For a purely static site without a backend, the easiest way is to ask the user for a PAT
    // Alternatively, redirect to GitHub OAuth if you have a Cloudflare worker setup.
    // GitHub implicit flow is deprecated, so we ask for PAT for this demo, or redirect.
    const pat = prompt("Enter your GitHub Personal Access Token (repo scope required):");
    if (pat) {
        localStorage.setItem('pastebin_gh_token', pat);
        currentToken = pat;
        fetchUserProfile();
    }
}

function logout() {
    localStorage.removeItem('pastebin_gh_token');
    currentToken = null;
    currentUser = null;
    updateAuthUI(false);
    
    if (window.location.pathname.includes('upload')) {
        window.location.reload();
    }
}

async function fetchUserProfile() {
    try {
        const response = await fetch(`${GITHUB_API_URL}/user`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            currentUser = await response.json();
            updateAuthUI(true);
        } else {
            console.error("Token invalid");
            logout();
        }
    } catch (e) {
        console.error("Failed to fetch user:", e);
    }
}

function updateAuthUI(isLoggedIn) {
    const authSection = document.getElementById('auth-section');
    if (authSection) {
        if (isLoggedIn && currentUser) {
            authSection.innerHTML = `
                <li><span class="online-count" id="onlineCount">2184</span></li>
                <div style="display:flex; align-items:center; gap: 10px;">
                    <img src="${currentUser.avatar_url}" style="width:24px; height:24px; border-radius:50%">
                    <span style="color:#aaa; font-size:13px">${currentUser.login}</span>
                    <li><a href="#" id="logout-btn" onclick="logout()">Logout</a></li>
                </div>
            `;
        } else {
            authSection.innerHTML = `
                <li><span class="online-count" id="onlineCount">2184</span></li>
                <li><a href="#" id="login-btn" onclick="handleLoginClick()">Login</a></li>
                <li><a href="#">Register</a></li>
            `;
        }
    }

    // Upload specific UI
    const authContainer = document.getElementById('authContainer');
    const uploadFormContainer = document.getElementById('uploadFormContainer');
    const githubUsername = document.getElementById('githubUsername');
    
    if (window.location.pathname.includes('upload')) {
        if (isLoggedIn) {
            authContainer.style.display = 'none';
            uploadFormContainer.style.display = 'block';
            if (githubUsername) githubUsername.textContent = currentUser.login;
        } else {
            authContainer.style.display = 'block';
            uploadFormContainer.style.display = 'none';
        }
    }
}

// --- Home Page specific ---
async function fetchRecentPastes() {
    if (!document.getElementById('pastesBody')) return;

    try {
        const url = `${GITHUB_API_URL}/repos/${config.GITHUB_OWNER}/${config.GITHUB_REPO}/contents/pastes`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                document.getElementById('pastesBody').innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #888;">No pastes found. Make sure the 'pastes' folder exists in the repository!</td></tr>`;
                return;
            }
            throw new Error(`Failed to fetch pastes: ${response.status}`);
        }

        const files = await response.json();
        const tb = document.getElementById('pastesBody');
        tb.innerHTML = '';
        
        // Sort descending by name (assuming name has timestamp or is random)
        files.reverse();

        if (files.length === 0) {
            tb.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #888;">No pastes found.</td></tr>`;
            return;
        }

        for (const file of files) {
            if (file.type !== 'file') continue;
            
            // Note: GitHub doesn't return author directly in /contents. Would need to fetch commits.
            // For parity with Doxbin, display random values for comments/views and "Unknown" for created by.
            
            const tr = document.createElement('tr');
            
            // Replicate table structure: Title, Comments, Views, Created by, Added
            const isEncFile = file.name.endsWith('.enc');
            const iconHTML = isEncFile ? '<i class="fas fa-lock" style="margin-right: 5px;"></i>' : '';
            
            tr.innerHTML = `
                <td><a href="/paste.html?id=${file.name}">${iconHTML}${file.name}</a></td>
                <td>-</td>
                <td>-</td>
                <td>Anonymous</td>
                <td>Today</td>
            `;
            tb.appendChild(tr);
        }

    } catch (e) {
        console.error(e);
        document.getElementById('pastesBody').innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #ff0000;">Error loading pastes. Check config.js.</td></tr>`;
    }
}

// --- Upload Page specific ---
function generateId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for(let i=0; i<8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}

function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

async function handleCreatePaste() {
    const content = document.getElementById('pasteContent').value;
    let filename = document.getElementById('pasteFilename').value.trim();
    const isEncrypted = document.getElementById('encryptCheckbox').checked;
    const password = document.getElementById('pastePassword').value;
    
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (!content) {
        errorDiv.textContent = 'Paste content cannot be empty.';
        return;
    }

    if (isEncrypted && !password) {
        errorDiv.textContent = 'Please enter a password for encryption.';
        return;
    }

    document.getElementById('createBtn').disabled = true;
    document.getElementById('createBtn').textContent = 'Creating...';

    if (!filename) {
        filename = generateId() + (isEncrypted ? '.enc' : '.txt');
    }

    let finalContent = content;
    let isEncryptedFlag = false;

    if (isEncrypted) {
        try {
            finalContent = await window.cryptoUtils.encryptText(content, password);
            finalContent = `---ENCRYPTED---\n${finalContent}`;
            isEncryptedFlag = true;
        } catch (e) {
            errorDiv.textContent = 'Encryption failed.';
            document.getElementById('createBtn').disabled = false;
            document.getElementById('createBtn').textContent = 'Create Paste';
            return;
        }
    }

    try {
        const path = `pastes/${filename}`;
        const url = `${GITHUB_API_URL}/repos/${config.GITHUB_OWNER}/${config.GITHUB_REPO}/contents/${path}`;
        
        const payload = {
            message: `Add paste ${filename}`,
            content: b64EncodeUnicode(finalContent)
        };

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            successDiv.textContent = 'Paste created successfully! Redirecting...';
            setTimeout(() => {
                window.location.href = `/paste.html?id=${filename}`;
            }, 1000);
        } else {
            const data = await res.json();
            errorDiv.textContent = `Error: ${data.message || 'Failed to create paste'}`;
            document.getElementById('createBtn').disabled = false;
            document.getElementById('createBtn').textContent = 'Create Paste';
        }

    } catch(e) {
        errorDiv.textContent = 'Network error while creating paste.';
        document.getElementById('createBtn').disabled = false;
        document.getElementById('createBtn').textContent = 'Create Paste';
    }
}

// --- Paste View Page specific ---
async function loadPaste() {
    if (!document.getElementById('pasteView')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    
    if (!id) {
        document.getElementById('loadingIndicator').textContent = 'No paste ID provided.';
        return;
    }

    try {
        const url = `${GITHUB_API_URL}/repos/${config.GITHUB_OWNER}/${config.GITHUB_REPO}/contents/pastes/${id}`;
        const res = await fetch(url);
        
        if (!res.ok) {
            document.getElementById('loadingIndicator').textContent = 'Paste not found or repository is private.';
            return;
        }

        const data = await res.json();
        
        // Decode content (ignoring newlines in base64 from GitHub)
        let content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
        
        document.getElementById('viewTitle').textContent = data.name;
        document.getElementById('viewSize').textContent = data.size;
        
        // Setup Raw link mapping to github raw content
        const rawBtn = document.getElementById('rawBtn');
        rawBtn.href = data.download_url;
        rawBtn.target = '_blank';

        document.getElementById('loadingIndicator').style.display = 'none';

        if (content.startsWith('---ENCRYPTED---\n')) {
            window.currentEncryptedContent = content.substring(16); // Remove header
            document.getElementById('passwordModal').style.display = 'flex';
            
            document.getElementById('decryptBtn').addEventListener('click', async () => {
                const pass = document.getElementById('decryptPassword').value;
                try {
                    const decrypted = await window.cryptoUtils.decryptText(window.currentEncryptedContent, pass);
                    document.getElementById('viewContent').textContent = decrypted;
                    document.getElementById('passwordModal').style.display = 'none';
                    document.getElementById('pasteView').style.display = 'block';
                    
                    // Update raw button logic to show decrypted if needed, or hide since it's encrypted on server
                    rawBtn.onclick = (e) => {
                        e.preventDefault();
                        const blob = new Blob([decrypted], { type: 'text/plain' });
                        window.open(URL.createObjectURL(blob), '_blank');
                    };
                } catch (e) {
                    document.getElementById('decryptError').style.display = 'block';
                }
            });
        } else {
            document.getElementById('viewContent').textContent = content;
            document.getElementById('pasteView').style.display = 'block';
        }

    } catch(e) {
        console.error(e);
        document.getElementById('loadingIndicator').textContent = 'Error loading paste.';
    }
}
