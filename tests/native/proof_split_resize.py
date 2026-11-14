def splitter_point(selected, separators):
    assert selected["width"] != selected["height"], selected
    vertical = selected["height"] > selected["width"]
    coordinate, extent = ("y", "height") if vertical else ("x", "width")
    low, high = selected[coordinate], selected[coordinate] + selected[extent]
    crossings = []
    for other in separators:
        assert other["width"] != other["height"], other
        if (other["height"] > other["width"]) != vertical:
            first = max(low, other[coordinate])
            last = min(high, other[coordinate] + other[extent])
            if first < last:
                crossings.append((first, last))
    free = []
    cursor = low
    for first, last in sorted(crossings) + [(high, high)]:
        if cursor < first:
            free.append((cursor, first))
        cursor = max(cursor, last)
    assert free, "No measured splitter span remains clear of other separators"
    span = max(free, key=lambda pair: pair[1] - pair[0])
    point = [
        selected["x"] + selected["width"] / 2,
        selected["y"] + selected["height"] / 2,
    ]
    point[1 if vertical else 0] = sum(span) / 2
    return point, span
