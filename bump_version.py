import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# 1. Fix CSS order for the DOM rendering
css_old_2 = '.rank-podium-card.rank-2 {\n  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);\n  border: 2px solid #cbd5e1;\n  order: 1;'
css_new_2 = '.rank-podium-card.rank-2 {\n  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);\n  border: 2px solid #cbd5e1;\n  order: 2;'
if css_old_2 in content:
    content = content.replace(css_old_2, css_new_2, 1)
    fixes += 1

css_old_1 = '.rank-podium-card.rank-1 {\n  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);\n  border: 3px solid #f59e0b;\n  order: 2;'
css_new_1 = '.rank-podium-card.rank-1 {\n  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);\n  border: 3px solid #f59e0b;\n  order: 1;'
if css_old_1 in content:
    content = content.replace(css_old_1, css_new_1, 1)
    fixes += 1

css_old_3 = '.rank-podium-card.rank-3 {\n  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);\n  border: 2px solid #fdba74;\n  order: 3;'
css_new_3 = '.rank-podium-card.rank-3 {\n  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);\n  border: 2px solid #fdba74;\n  order: 3;'
# rank 3 is already order 3, but just to be sure we don't break anything.

# Mobile CSS order also needs to be checked
mobile_css_old_2 = '.rank-podium-card.rank-2 { order: 1; }'
mobile_css_new_2 = '.rank-podium-card.rank-2 { order: 2; }'
if mobile_css_old_2 in content:
    content = content.replace(mobile_css_old_2, mobile_css_new_2, 1)
    fixes += 1

mobile_css_old_1 = '.rank-podium-card.rank-1 { order: 2; }'
mobile_css_new_1 = '.rank-podium-card.rank-1 { order: 1; }'
if mobile_css_old_1 in content:
    content = content.replace(mobile_css_old_1, mobile_css_new_1, 1)
    fixes += 1

# 2. Fix shareAsImage order
js_old = 'const displayOrder = topRanks.length === 3 ? [1, 0, 2] : topRanks.map((_, i) => i);'
js_new = 'const displayOrder = topRanks.map((_, i) => i);'
if js_old in content:
    content = content.replace(js_old, js_new, 1)
    fixes += 1

content = content.replace('v1.1.13', 'v1.1.14')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Done: {fixes} fixes applied. Version bumped to v1.1.14")
