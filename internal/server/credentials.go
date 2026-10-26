package server

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha3"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
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
