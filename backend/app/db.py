"""Local-only SQLite store. Demo examples are illustrative fixtures."""
import os
import sqlite3
import json
from pathlib import Path

DB_PATH = os.getenv('PALATE_DB_PATH', str(Path(__file__).resolve().parents[2] / 'palate.sqlite3'))

PLACES = [
 # ID, name, category, area, city, price, cuisines, community score, icon, color
 (1,'Myeongdong Kyoja','Restaurants','Myeong-dong','Seoul',2,['Korean','Noodles'],9.2,'🍜','peach'),
 (2,'Woo Lae Oak','Restaurants','Jung-gu','Seoul',3,['Korean','Noodles'],9.0,'🥘','peach'),
 (3,'Jangin Dak-galbi','Restaurants','Hongdae','Seoul',2,['Korean','Chicken'],8.2,'🍗','peach'),
 (4,'Millo Coffee Roasters','Coffee & Tea','Mapo','Seoul',2,['Coffee'],8.7,'☕','lavender'),
 (5,'Monsieur Bu Bu Coffee Stand','Coffee & Tea','Seongsu','Seoul',2,['Coffee'],8.5,'🧋','lavender'),
 (6,'상수리bar','Bars','Sangsu','Seoul',3,['Cocktails'],8.8,'🍸','blue'),
 (7,'Vinyl','Bars','Hongdae','Seoul',2,['Cocktails','Wine'],8.1,'🍷','blue'),
 (8,'Salt24','Bakeries','Seongsu','Seoul',2,['Bread','Pastry'],7.8,'🥐','butter'),
 (9,'Our Bakery','Bakeries','Gangnam','Seoul',2,['Bread','Pastry'],8.3,'🍞','butter'),
 (10,'Bakery Cafe Aoitori','Bakeries','Hongdae','Seoul',2,['Bread','Pastry'],8.7,'🥖','butter'),
 (11,'Cafe Onion','Coffee & Tea','Anguk','Seoul',2,['Coffee','Pastry'],8.6,'🧁','lavender'),
 (12,'London Bagel Museum','Bakeries','Anguk','Seoul',3,['Bagel','Bread'],8.9,'🥯','butter'),
 (13,'진옥화할매원조닭한마리','Restaurants','Dongdaemun','Seoul',2,['Korean','Chicken'],8.9,'🍲','peach'),
 (14,'Fritz Coffee','Coffee & Tea','Mapo','Seoul',2,['Coffee','Pastry'],8.8,'🫘','lavender'),
 (15,'Gelateria Dangdo','Ice Cream & Dessert','Yeonnam','Seoul',2,['Gelato'],8.9,'🍨','mint'),
 (16,'Bar Cham','Bars','Seochon','Seoul',4,['Cocktails'],9.3,'🍹','blue'),
]
# Nine demo ranks correspond to a *synthetic* re-creation of the observed UX flow.
SEED_RANKS = [(1,'liked',2.8),(2,'liked',2.5),(3,'liked',2.2),
              (4,'liked',2.8),(5,'liked',2.3), (6,'liked',2.8),(7,'liked',2.3),
              (8,'liked',2.8),(9,'fine',1.5)]


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def initialize():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS places(
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
          area TEXT NOT NULL, city TEXT NOT NULL, price INTEGER NOT NULL,
          cuisines TEXT NOT NULL, average_score REAL NOT NULL,
          icon TEXT NOT NULL, color TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ranks(
          place_id INTEGER PRIMARY KEY REFERENCES places(id),
          category TEXT NOT NULL, sentiment TEXT NOT NULL,
          value REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS bookmarks(place_id INTEGER PRIMARY KEY REFERENCES places(id));
        CREATE TABLE IF NOT EXISTS rank_drafts(
          id TEXT PRIMARY KEY, place_id INTEGER NOT NULL REFERENCES places(id),
          category TEXT NOT NULL, sentiment TEXT NOT NULL,
          lo INTEGER NOT NULL, hi INTEGER NOT NULL,
          skipped TEXT NOT NULL DEFAULT '[]', history TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        ''')
        count = db.execute('SELECT COUNT(*) AS c FROM places').fetchone()['c']
        if not count:
            db.executemany('INSERT INTO places VALUES(?,?,?,?,?,?,?,?,?,?)',
                           [(id, name, cat, area, city, price, json.dumps(cuisines, ensure_ascii=False),avg,icon,color)
                            for id,name,cat,area,city,price,cuisines,avg,icon,color in PLACES])
            for place_id, sentiment, value in SEED_RANKS:
                cat = next(row[2] for row in PLACES if row[0] == place_id)
                db.execute('INSERT INTO ranks(place_id,category,sentiment,value) VALUES(?,?,?,?)',
                           (place_id,cat,sentiment,value))


def reset():
    with connect() as db:
        db.execute('DELETE FROM rank_drafts')
        db.execute('DELETE FROM bookmarks')
        db.execute('DELETE FROM ranks')
        for place_id, sentiment, value in SEED_RANKS:
            cat = next(row[2] for row in PLACES if row[0] == place_id)
            db.execute('INSERT INTO ranks(place_id,category,sentiment,value) VALUES(?,?,?,?)',
                       (place_id,cat,sentiment,value))
