package server

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha3"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func credentialAlgorithm(encoded, algorithm string) string {
	if strings.HasPrefix(encoded, "$2") {
		return "bcrypt"
	}
	if strings.HasPrefix(encoded, "$argon2id$") {
		return "argon2id"
	}
	if strings.HasPrefix(encoded, "$argon2i$") {
		return "argon2i"
	}
	return strings.ToLower(algorithm)
}
func validateCredential(encoded, algorithm, secret string) error {
	switch credentialAlgorithm(encoded, algorithm) {
	case "bcrypt":
		if _, e := bcrypt.Cost([]byte(encoded)); e != nil {
			return e
		}
	case "argon2id", "argon2i":
		if _, _, _, _, e := argonParameters(encoded); e != nil {
			return e
		}
	case "md5", "md5salt":
		b, e := hex.DecodeString(encoded)
		if e != nil || len(b) != 16 {
			return fmt.Errorf("MD5 密码格式无效")
		}
	case "sha256", "sha256salt", "sha3", "sha3salt":
		b, e := hex.DecodeString(encoded)
		if e != nil || len(b) != 32 {
			return fmt.Errorf("SHA 密码格式无效")
		}
	default:
		return fmt.Errorf("不支持的密码算法：%s", algorithm)
	}
	if secret != "" {
		if _, e := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimRight(secret, "="))); e != nil {
			return fmt.Errorf("动态验证码密钥格式无效")
		}
	}
	return nil
}
func argonParameters(encoded string) (uint32, uint32, uint8, [][]byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[2] != "v=19" {
		return 0, 0, 0, nil, fmt.Errorf("Argon2 密码格式无效")
	}
	var memory, iterations uint32
	var parallel uint8
	if n, e := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallel); e != nil || n != 3 || memory < 8 || iterations == 0 || parallel == 0 || memory > 1048576 || iterations > 20 {
		return 0, 0, 0, nil, fmt.Errorf("Argon2 参数无效或超出可用资源")
	}
	salt, e := base64.RawStdEncoding.DecodeString(parts[4])
	if e != nil {
		return 0, 0, 0, nil, e
	}
	hash, e := base64.RawStdEncoding.DecodeString(parts[5])
	if e != nil || len(hash) == 0 {
		return 0, 0, 0, nil, fmt.Errorf("Argon2 摘要无效")
	}
	return memory, iterations, parallel, [][]byte{salt, hash}, nil
}
func verifyCredential(encoded, algorithm, salt, password string) bool {
	algorithm = credentialAlgorithm(encoded, algorithm)
	if algorithm == "bcrypt" {
		return bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password)) == nil
	}
	if algorithm == "argon2id" || algorithm == "argon2i" {
		m, t, p, parts, e := argonParameters(encoded)
		if e != nil {
			return false
		}
		var actual []byte
		if algorithm == "argon2id" {
			actual = argon2.IDKey([]byte(password), parts[0], t, m, p, uint32(len(parts[1])))
		} else {
			actual = argon2.Key([]byte(password), parts[0], t, m, p, uint32(len(parts[1])))
		}
		return subtle.ConstantTimeCompare(actual, parts[1]) == 1
	}
	var actual string
	switch algorithm {
	case "md5", "md5salt":
		if algorithm == "md5salt" {
			password += salt
		}
		sum := md5.Sum([]byte(password))
		actual = hex.EncodeToString(sum[:])
	case "sha256", "sha256salt":
		if algorithm == "sha256salt" {
			password += salt
		}
		sum := sha256.Sum256([]byte(password))
		actual = hex.EncodeToString(sum[:])
	case "sha3", "sha3salt":
		if algorithm == "sha3salt" || algorithm == "sha3" {
			password += salt
		}
		sum := sha3.Sum256([]byte(password))
		actual = hex.EncodeToString(sum[:])
	default:
		return false
	}
	return subtle.ConstantTimeCompare([]byte(strings.ToLower(encoded)), []byte(actual)) == 1
}
func (s *Server) verifyUser(id, encoded, password, code string) (bool, bool) {
	var algorithm, salt, secret string
	_ = s.Store.DB.QueryRow("SELECT algorithm,salt,mfa_secret FROM user_credentials WHERE user_id=?", id).Scan(&algorithm, &salt, &secret)
	valid := verifyCredential(encoded, algorithm, salt, password)
	if !valid {
		return false, false
	}
	if secret != "" && !verifyTOTP(secret, code) {
		return false, true
	}
	if credentialAlgorithm(encoded, algorithm) != "bcrypt" && len(password) <= 72 {
		if hash, e := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost); e == nil {
			_, _ = s.Store.DB.Exec("UPDATE users SET password=? WHERE id=? AND password=?", string(hash), id, encoded)
		}
	}
	return true, false
}
func (s *Server) hasMFA(userID string) bool {
	var secret string
	_ = s.Store.DB.QueryRow("SELECT COALESCE(mfa_secret,'') FROM user_credentials WHERE user_id=?", userID).Scan(&secret)
	return strings.TrimSpace(secret) != ""
}
func (s *Server) mfaSetup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	a := actor(r)
	if s.hasMFA(a.ID) {
		plugin.Fail(w, 409, "已启用两步验证，如需更换密钥请先关闭")
		return
	}
	var rawSecret [20]byte
	if _, err := rand.Read(rawSecret[:]); bad(w, err) {
		return
	}
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(rawSecret[:])
	expires := time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)
	payload, _ := json.Marshal(plugin.Record{"secret": secret, "expiresAt": expires})
	if bad(w, s.Store.Set("mfa-setup:"+a.ID, string(payload))) {
		return
	}
	issuer := strings.TrimSpace(s.Store.Setting("name", "PxBoard"))
	if issuer == "" {
		issuer = "PxBoard"
	}
	otpauth := "otpauth://totp/" + url.PathEscape(issuer+":"+a.Email) + "?secret=" + secret + "&issuer=" + url.QueryEscape(issuer)
	plugin.JSON(w, plugin.Record{"secret": secret, "otpauthUrl": otpauth, "expiresAt": expires})
}
func (s *Server) mfaEnable(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	a := actor(r)
	if s.hasMFA(a.ID) {
		plugin.Fail(w, 409, "已启用两步验证")
		return
	}
	var b struct{ Password, Code string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	var hash string
	if s.Store.DB.QueryRow("SELECT password FROM users WHERE id=? AND status='active'", a.ID).Scan(&hash) != nil {
		plugin.Fail(w, 403, "账户不存在或已停用")
		return
	}
	if valid, _ := s.verifyUser(a.ID, hash, b.Password, ""); !valid {
		plugin.Fail(w, 400, "当前登录密码不正确")
		return
	}
	var raw string
	var setup plugin.Record
	if s.Store.DB.QueryRow("SELECT value FROM settings WHERE key=?", "mfa-setup:"+a.ID).Scan(&raw) != nil || json.Unmarshal([]byte(raw), &setup) != nil || plugin.Text(setup, "expiresAt") <= store.Now() {
		plugin.Fail(w, 400, "两步验证初始化已失效，请重新获取密钥")
		return
	}
	secret := plugin.Text(setup, "secret")
	if !verifyTOTP(secret, strings.TrimSpace(b.Code)) {
		plugin.FailCode(w, 400, "mfa_invalid", "动态验证码不正确")
		return
	}
	tx, err := s.Store.DB.Begin()
	if bad(w, err) {
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec("INSERT INTO user_credentials(user_id,algorithm,salt,mfa_secret) VALUES(?,'bcrypt','',?) ON CONFLICT(user_id) DO UPDATE SET mfa_secret=excluded.mfa_secret", a.ID, secret)
	if bad(w, err) {
		return
	}
	_, err = tx.Exec("DELETE FROM settings WHERE key=?", "mfa-setup:"+a.ID)
	if bad(w, err) || bad(w, tx.Commit()) {
		return
	}
	s.Store.Log(a.Email, "account.mfa-enabled", a.ID)
	plugin.JSON(w, true)
}
func (s *Server) mfaDisable(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	a := actor(r)
	if !s.hasMFA(a.ID) {
		plugin.JSON(w, true)
		return
	}
	var b struct{ Password, Code string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	var hash string
	if s.Store.DB.QueryRow("SELECT password FROM users WHERE id=? AND status='active'", a.ID).Scan(&hash) != nil {
		plugin.Fail(w, 403, "账户不存在或已停用")
		return
	}
	valid, mfa := s.verifyUser(a.ID, hash, b.Password, strings.TrimSpace(b.Code))
	if mfa {
		plugin.FailCode(w, 400, "mfa_required", "请输入正确的 6 位动态验证码")
		return
	}
	if !valid {
		plugin.Fail(w, 400, "当前登录密码不正确")
		return
	}
	_, err := s.Store.DB.Exec("UPDATE user_credentials SET mfa_secret='' WHERE user_id=?", a.ID)
	if bad(w, err) {
		return
	}
	_, _ = s.Store.DB.Exec("DELETE FROM settings WHERE key=?", "mfa-setup:"+a.ID)
	s.Store.Log(a.Email, "account.mfa-disabled", a.ID)
	plugin.JSON(w, true)
}
func verifyTOTP(secret, code string) bool {
	if len(code) != 6 {
		return false
	}
	key, e := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimRight(secret, "=")))
	if e != nil {
		return false
	}
	counter := time.Now().Unix() / 30
	for offset := int64(-1); offset <= 1; offset++ {
		var message [8]byte
		binary.BigEndian.PutUint64(message[:], uint64(counter+offset))
		mac := hmac.New(sha1.New, key)
		_, _ = mac.Write(message[:])
		b := mac.Sum(nil)
		start := b[len(b)-1] & 15
		value := binary.BigEndian.Uint32(b[start:start+4]) & 0x7fffffff
		expected := fmt.Sprintf("%06d", value%1000000)
		if hmac.Equal([]byte(expected), []byte(code)) {
			return true
		}
	}
	return false
}
