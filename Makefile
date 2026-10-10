# Makefile for File System Explorer (N-ary Tree)
# Usage:
#   make          → compile fstree.c into ./fstree
#   make clean    → remove compiled binary and data file
#   make reset    → remove data.txt to force sample tree on next run

CC = gcc
CFLAGS = -Wall -Wextra -std=c99
TARGET = fstree

all: $(TARGET)

$(TARGET): fstree.c
	$(CC) $(CFLAGS) -o $(TARGET) fstree.c

clean:
	rm -f $(TARGET) data.txt

reset:
	rm -f data.txt

.PHONY: all clean reset
