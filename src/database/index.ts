import Database from 'better-sqlite3';
import path from 'path';
import { Product, MonitoringResult, AlertLog, AppConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(__dirname, '../../data/coupang_monitor.db');

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    // 데이터 폴더 생성
    const fs = require('fs');
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.initialize();
  }

  private initialize(): void {
    // 상품 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        name TEXT NOT NULL,
        expected_seller TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // 모니터링 결과 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitoring_results (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_url TEXT NOT NULL,
        product_name TEXT,
        expected_seller TEXT NOT NULL,
        actual_seller TEXT,
        seller_link TEXT,
        is_fraudulent INTEGER DEFAULT 0,
        checked_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // 알림 로그 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alert_logs (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT,
        expected_seller TEXT NOT NULL,
        actual_seller TEXT NOT NULL,
        alerted_at TEXT NOT NULL,
        slack_response TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // 설정 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // 기본 설정 초기화
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const defaultConfig: AppConfig = {
      slackWebhookUrl: '',
      slackChannel: '#coupang-alerts',
      checkIntervalMinutes: { min: 5, max: 10 },
      checkIntervalVarianceSeconds: 30,
      headless: true
    };

    const existingConfig = this.db.prepare('SELECT key FROM config WHERE key = ?').get('settings');
    if (!existingConfig) {
      this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('settings', JSON.stringify(defaultConfig));
    }
  }

  // 상품 관련 메서드
  addProduct(url: string, name: string, expectedSeller: string): Product {
    const now = new Date().toISOString();
    const product: Product = {
      id: uuidv4(),
      url,
      name,
      expectedSeller,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO products (id, url, name, expected_seller, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(product.id, product.url, product.name, product.expectedSeller, 1, product.createdAt, product.updatedAt);

    return product;
  }

  getProducts(): Product[] {
    const rows = this.db.prepare('SELECT * FROM products ORDER BY created_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      name: row.name,
      expectedSeller: row.expected_seller,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getActiveProducts(): Product[] {
    const rows = this.db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      name: row.name,
      expectedSeller: row.expected_seller,
      isActive: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getProductById(id: string): Product | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      name: row.name,
      expectedSeller: row.expected_seller,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateProduct(id: string, updates: Partial<Pick<Product, 'url' | 'name' | 'expectedSeller' | 'isActive'>>): boolean {
    const product = this.getProductById(id);
    if (!product) return false;

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE products
      SET url = ?, name = ?, expected_seller = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.url ?? product.url,
      updates.name ?? product.name,
      updates.expectedSeller ?? product.expectedSeller,
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (product.isActive ? 1 : 0),
      now,
      id
    );

    return true;
  }

  deleteProduct(id: string): boolean {
    const result = this.db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // 모니터링 결과 관련 메서드
  addMonitoringResult(result: Omit<MonitoringResult, 'id'>): MonitoringResult {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO monitoring_results
      (id, product_id, product_url, product_name, expected_seller, actual_seller, seller_link, is_fraudulent, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      result.productId,
      result.productUrl,
      result.productName,
      result.expectedSeller,
      result.actualSeller,
      result.sellerLink,
      result.isFraudulent ? 1 : 0,
      result.checkedAt
    );

    return { id, ...result };
  }

  getMonitoringResults(limit: number = 100): MonitoringResult[] {
    const rows = this.db.prepare(`
      SELECT * FROM monitoring_results
      ORDER BY checked_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      productUrl: row.product_url,
      productName: row.product_name,
      expectedSeller: row.expected_seller,
      actualSeller: row.actual_seller,
      sellerLink: row.seller_link,
      isFraudulent: !!row.is_fraudulent,
      checkedAt: row.checked_at
    }));
  }

  getFraudulentResults(limit: number = 100): MonitoringResult[] {
    const rows = this.db.prepare(`
      SELECT * FROM monitoring_results
      WHERE is_fraudulent = 1
      ORDER BY checked_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      productUrl: row.product_url,
      productName: row.product_name,
      expectedSeller: row.expected_seller,
      actualSeller: row.actual_seller,
      sellerLink: row.seller_link,
      isFraudulent: true,
      checkedAt: row.checked_at
    }));
  }

  // 알림 로그 관련 메서드
  addAlertLog(log: Omit<AlertLog, 'id'>): AlertLog {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO alert_logs
      (id, product_id, product_name, expected_seller, actual_seller, alerted_at, slack_response)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.productId,
      log.productName,
      log.expectedSeller,
      log.actualSeller,
      log.alertedAt,
      log.slackResponse
    );

    return { id, ...log };
  }

  getAlertLogs(limit: number = 100): AlertLog[] {
    const rows = this.db.prepare(`
      SELECT * FROM alert_logs
      ORDER BY alerted_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      expectedSeller: row.expected_seller,
      actualSeller: row.actual_seller,
      alertedAt: row.alerted_at,
      slackResponse: row.slack_response
    }));
  }

  // 설정 관련 메서드
  getConfig(): AppConfig {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get('settings') as any;
    return JSON.parse(row.value);
  }

  updateConfig(config: Partial<AppConfig>): void {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...config };
    this.db.prepare('UPDATE config SET value = ? WHERE key = ?').run(JSON.stringify(newConfig), 'settings');
  }

  // 통계
  getStats(): { totalProducts: number; activeProducts: number; totalChecks: number; fraudulentFound: number } {
    const totalProducts = (this.db.prepare('SELECT COUNT(*) as count FROM products').get() as any).count;
    const activeProducts = (this.db.prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1').get() as any).count;
    const totalChecks = (this.db.prepare('SELECT COUNT(*) as count FROM monitoring_results').get() as any).count;
    const fraudulentFound = (this.db.prepare('SELECT COUNT(*) as count FROM monitoring_results WHERE is_fraudulent = 1').get() as any).count;

    return { totalProducts, activeProducts, totalChecks, fraudulentFound };
  }

  close(): void {
    this.db.close();
  }
}

export const db = new DatabaseManager();
export default db;
