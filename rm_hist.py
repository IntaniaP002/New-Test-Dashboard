with open('src/components/DashboardView.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if '{isHistorical' in line and '? `Historical:' in line:
        continue
    new_lines.append(line)

with open('src/components/DashboardView.tsx', 'w') as f:
    f.writelines(new_lines)
