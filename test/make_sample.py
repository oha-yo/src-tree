# 試験用の「古い Java プロジェクト風」のフォルダ（test/sample-project）を作る。
#   python test/make_sample.py
# Shift_JIS のファイル、上限（2500行）を超える大きなファイル、外すべきもの（.class、bin/、.git/）を含む。
import os, shutil
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample-project")
if os.path.exists(base):
    shutil.rmtree(base)


def write(rel, text, enc="utf-8"):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding=enc, newline="\r\n") as f:
        f.write(text)


write("src/com/example/order/batch/DailyOrderBatch.java", """package com.example.order.batch;

import java.sql.Connection;

/**
 * 日次の受注集計バッチ（Shift_JIS で保存されている想定）
 */
public class DailyOrderBatch extends AbstractBatch {
    public static void main(String[] args) throws Exception {
        new DailyOrderBatch().run(args);
    }

    protected void execute(Connection con) throws Exception {
        // 受注テーブルから前日分を集計する
        OrderDao dao = new OrderDao(con);
        dao.summarize();
    }
}
""", enc="cp932")
write("src/com/example/order/batch/AbstractBatch.java", """package com.example.order.batch;

public abstract class AbstractBatch {
    public void run(String[] args) throws Exception {
        // 共通の前処理
        execute(null);
    }
    protected abstract void execute(java.sql.Connection con) throws Exception;
}
""")
write("src/com/example/order/dao/OrderDao.java", """package com.example.order.dao;

/** Markdown の囲み ``` を含むコメントがあっても壊れないかの試験 */
public class OrderDao {
    private final java.sql.Connection con;
    public OrderDao(java.sql.Connection con) { this.con = con; }
    public void summarize() { /* SELECT ... */ }
}
""")
big = ["package com.example.order.web;", "", "public class OrderListAction {"]
big += [f"    // {i} 行目の処理" for i in range(1, 3000)]
big += ["}"]
write("src/com/example/order/web/OrderListAction.java", "\n".join(big) + "\n")
write("WebContent/WEB-INF/web.xml", """<?xml version="1.0" encoding="UTF-8"?>
<web-app>
  <servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet>
</web-app>
""")
write("WebContent/WEB-INF/struts-config.xml", """<?xml version="1.0" encoding="Shift_JIS"?>
<struts-config>
  <action-mappings>
    <action path="/orderList" type="com.example.order.web.OrderListAction"/>
  </action-mappings>
</struts-config>
""", enc="cp932")
write("WebContent/order/list.jsp", """<%@ page contentType="text/html; charset=Windows-31J" %>
<html><body>受注一覧</body></html>
""", enc="cp932")
write("build.xml", """<project name="order" default="build"><target name="build"/></project>
""")
write("conf/db.properties", "db.url=jdbc:oracle:thin:@localhost:1521:ORCL\n")
write("bin/run_daily.sh", "#!/bin/sh\njava -cp classes com.example.order.batch.DailyOrderBatch\n")
# 外すべきもの
write("bin/com/example/order/batch/DailyOrderBatch.class", "BINARY")
write("classes/com/example/order/dao/OrderDao.class", "BINARY")
write(".git/config", "[core]\n")
write(".settings/org.eclipse.jdt.core.prefs", "eclipse=1\n")
write("lib/ojdbc6.jar", "JAR")
print("作成しました:", base)
