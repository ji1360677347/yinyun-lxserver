const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\*\/|#)/
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g

export function normalizeCustomSourceUpdateUrl(value: unknown, baseUrl?: string): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined
    try {
        const url = new URL(value.trim(), baseUrl)
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
    } catch {
        return undefined
    }
}

export function parseCustomSourceUpdateResponse(content: string, responseUrl: string): { downloadUrl?: string, upToDate?: boolean } | undefined {
    let response: any
    try { response = JSON.parse(content) } catch { return undefined }
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new Error('音源更新接口返回了无效的更新信息')
    }
    if (response.success === false || (response.code != null && ![0, 200, '0', '200'].includes(response.code))) {
        throw new Error('音源更新接口返回失败，未修改当前音源')
    }
    const data = response.data && typeof response.data === 'object' ? response.data : response
    const link = data.downloadUrl || data.scriptUrl || data.url || data.updateUrl
    if (link) {
        const downloadUrl = normalizeCustomSourceUpdateUrl(link, responseUrl)
        if (!downloadUrl) throw new Error('音源更新信息中的下载地址无效')
        return { downloadUrl }
    }
    const message = String(data.msg || response.msg || data.message || response.message || '').trim()
    if (response.available === false || data.available === false
        || /^(?:已(?:经)?是最新版本|当前已是最新版本|暂无更新|没有可用更新|no updates?(?: available)?|already up[- ]to[- ]date)[。！.!]?$/i.test(message)) {
        return { upToDate: true }
    }
    throw new Error('音源更新信息未提供脚本下载地址，也未明确表示已是最新版本')
}

export function normalizeCustomSourceForUpdateComparison(content: string) {
    return content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => COMMENT_LINE.test(line) ? line.replace(ISO_TIMESTAMP, '<timestamp>') : line)
        .join('\n')
}

export function isCustomSourceUpdateAvailable(
    currentContent: string,
    remoteContent: string,
    currentVersion: string | number,
    remoteVersion?: string | number,
) {
    const contentChanged = normalizeCustomSourceForUpdateComparison(currentContent)
        !== normalizeCustomSourceForUpdateComparison(remoteContent)
    const versionChanged = remoteVersion !== undefined && String(remoteVersion) !== String(currentVersion)
    return contentChanged || versionChanged
}
