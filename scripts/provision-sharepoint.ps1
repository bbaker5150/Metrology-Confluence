#Requires -Version 7.0
<#
.SYNOPSIS
Creates or repairs the Metrology-Confluence lists using SharePoint REST v1.
.DESCRIPTION
Run as an identity with Manage Lists on the target web. Supply a delegated
SharePoint access token as a SecureString; its audience must be SharePoint,
not Microsoft Graph. The script never grants permissions or creates sample data.
Existing KB_* aliases are reused without renaming. Duplicate aliases and
incompatible column types fail preflight before schema writes.
.EXAMPLE
$token = Read-Host 'SharePoint access token' -AsSecureString
./scripts/provision-sharepoint.ps1 -SiteUrl https://tenant.sharepoint.com/sites/Metrology -AccessToken $token
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][uri] $SiteUrl,
    [Parameter(Mandatory)][securestring] $AccessToken
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($SiteUrl.Scheme -ne 'https' -or $SiteUrl.Query -or $SiteUrl.Fragment -or $SiteUrl.UserInfo) {
    throw 'SiteUrl must be an HTTPS SharePoint web URL without credentials, query parameters, or a fragment.'
}
$script:WebUrl = $SiteUrl.AbsoluteUri.TrimEnd('/')
$script:ApiRoot = "$script:WebUrl/_api/"
$script:Token = ConvertFrom-SecureString -SecureString $AccessToken -AsPlainText
$script:Digest = $null
$script:DigestExpires = [datetime]::MinValue

function Get-Property($Object, [string] $Name, $Default = $null) {
    if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) { return ,$Object.$Name }
    return ,$Default
}

function Resolve-ApiUrl([string] $Path) {
    $url = if ($Path.StartsWith('/_api/')) { "$script:WebUrl$Path" } else { $Path }
    if (-not $url.StartsWith($script:ApiRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'SharePoint returned a request URL outside the selected site API.'
    }
    return $url
}

function Invoke-SpRequest {
    param([string] $Path, [ValidateSet('GET', 'POST')][string] $Method = 'GET', $Body,
          [hashtable] $ExtraHeaders = @{}, [switch] $VerboseJson, [switch] $WithoutDigest)
    $headers = @{
        Authorization = "Bearer $script:Token"
        Accept = $(if ($VerboseJson) { 'application/json;odata=verbose' } else { 'application/json;odata=nometadata' })
    }
    if ($Method -eq 'POST' -and -not $WithoutDigest) { $headers['X-RequestDigest'] = Get-FormDigest }
    foreach ($name in $ExtraHeaders.Keys) { $headers[$name] = $ExtraHeaders[$name] }
    $request = @{ Uri = (Resolve-ApiUrl $Path); Method = $Method; Headers = $headers; TimeoutSec = 60 }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $request.Body = ConvertTo-Json -InputObject $Body -Depth 20 -Compress
        $request.ContentType = $headers.Accept
    }
    try {
        $response = Invoke-WebRequest @request
        if ([string]::IsNullOrWhiteSpace($response.Content)) { return $null }
        $value = ConvertFrom-Json -InputObject $response.Content
        return Get-Property $value 'd' $value
    } catch {
        $response = Get-Property $_.Exception 'Response'
        $status = Get-Property $response 'StatusCode' 'unavailable'
        # Never print the request or its Authorization header.
        $details = Get-Property (Get-Property $_ 'ErrorDetails') 'Message' ''
        throw "SharePoint $Method failed (HTTP $status) for $Path. Check site URL, token audience/expiry, permissions, and SharePoint list settings. $details"
    }
}

function Get-FormDigest {
    if ($script:Digest -and [datetime]::UtcNow -lt $script:DigestExpires) { return $script:Digest }
    $info = Invoke-SpRequest -Path '/_api/contextinfo' -Method POST -WithoutDigest
    $info = Get-Property $info 'GetContextWebInformation' $info
    $script:Digest = Get-Property $info 'FormDigestValue'
    if (-not $script:Digest) { throw 'SharePoint returned no form digest; no schema write was attempted.' }
    $seconds = [double](Get-Property $info 'FormDigestTimeoutSeconds' 1800)
    $script:DigestExpires = [datetime]::UtcNow.AddSeconds([Math]::Max(1, $seconds - 60))
    return $script:Digest
}

function Get-SpCollection([string] $Path) {
    $items = [Collections.Generic.List[object]]::new()
    $seen = [Collections.Generic.HashSet[string]]::new()
    while ($Path) {
        if (-not $seen.Add($Path)) { throw 'SharePoint returned a repeated pagination URL.' }
        $body = Invoke-SpRequest -Path $Path
        $rows = Get-Property $body 'value' (Get-Property $body 'results')
        if ($null -eq $rows) { throw "SharePoint did not return a collection for $Path." }
        foreach ($row in $rows) { $items.Add($row) }
        $Path = Get-Property $body '@odata.nextLink' (Get-Property $body 'odata.nextLink' (Get-Property $body '__next' ''))
    }
    return $items.ToArray()
}

function Get-ListPath([string] $Title) {
    $encoded = [uri]::EscapeDataString($Title.Replace("'", "''"))
    return "/_api/web/lists/getbytitle('$encoded')"
}

function New-Field([string] $Name, [string] $Type, [bool] $Indexed = $false, [string[]] $Choices = @()) {
    return @{ Name = $Name; Type = $Type; Indexed = $Indexed; Choices = $Choices }
}

# Mirrors src/services/schema.ts. Id, Title, Modified, and Created are built in.
$schema = @(
    @{ Key = 'Spaces'; Fields = @(
        (New-Field 'Slug' 'Text' $true), (New-Field 'Description' 'Note'),
        (New-Field 'IconName' 'Text'), (New-Field 'AccentColor' 'Text'),
        (New-Field 'SortOrder' 'Number'), (New-Field 'IsArchived' 'Boolean')
    ) },
    @{ Key = 'Pages'; Fields = @(
        (New-Field 'SpaceId' 'Number' $true), (New-Field 'ParentPageId' 'Number' $true),
        (New-Field 'Content' 'Note'), (New-Field 'Summary' 'Note'), (New-Field 'Tags' 'Text'),
        (New-Field 'Status' 'Choice' $true @('Draft', 'Published', 'Archived')),
        (New-Field 'IsPinned' 'Boolean'), (New-Field 'TemplateType' 'Text'),
        (New-Field 'VersionCount' 'Number'), (New-Field 'AuthorName' 'Text'), (New-Field 'LastEditorName' 'Text')
    ) },
    @{ Key = 'Versions'; Fields = @(
        (New-Field 'PageId' 'Number' $true), (New-Field 'VersionNumber' 'Number'),
        (New-Field 'TitleSnapshot' 'Text'), (New-Field 'ContentSnapshot' 'Note'),
        (New-Field 'ChangeNote' 'Text'), (New-Field 'EditedBy' 'Text')
    ) },
    @{ Key = 'Comments'; Fields = @(
        (New-Field 'PageId' 'Number' $true), (New-Field 'CommentBody' 'Note'), (New-Field 'AuthorName' 'Text')
    ) }
)

function ConvertTo-FieldXml($Field) {
    $attributes = "Type=`"$($Field.Type)`" Name=`"$($Field.Name)`" StaticName=`"$($Field.Name)`" DisplayName=`"$($Field.Name)`""
    if ($Field.Indexed) { $attributes += ' Indexed="TRUE"' }
    if ($Field.Type -eq 'Note') { $attributes += ' NumLines="12" RichText="FALSE" AppendOnly="FALSE"' }
    if ($Field.Type -eq 'Text') { $attributes += ' MaxLength="255"' }
    $choices = ''
    if ($Field.Choices.Count) {
        $choices = '<CHOICES>' + (($Field.Choices | ForEach-Object { '<CHOICE>' + [Security.SecurityElement]::Escape($_) + '</CHOICE>' }) -join '') + '</CHOICES>'
    }
    return "<Field $attributes>$choices</Field>"
}

try {
    $permissions = Invoke-SpRequest -Path '/_api/web/EffectiveBasePermissions'
    $permissions = Get-Property $permissions 'EffectiveBasePermissions' $permissions
    $low = [uint64](Get-Property $permissions 'Low' 0)
    if (($low -band 2048) -eq 0) { throw 'The signed-in identity needs Manage Lists on this SharePoint web. No changes were made.' }

    $catalog = @(Get-SpCollection '/_api/web/lists?$select=Id,Title,BaseTemplate&$top=500')
    $plan = @()
    # Resolve every alias and validate every existing custom field before writes.
    foreach ($list in $schema) {
        $canonical = "Metrology-Confluence - $($list.Key)"
        $aliases = @($canonical, "KB_$($list.Key)")
        $matches = @($catalog | Where-Object { $_.Title -in $aliases })
        if ($matches.Count -gt 1) { throw "Multiple list aliases exist for $canonical. Resolve the duplicate lists before provisioning." }
        $exists = $matches.Count -eq 1
        $title = if ($exists) { $matches[0].Title } else { $canonical }
        if ($exists -and $matches[0].BaseTemplate -ne 100) { throw "$title exists but is not a generic SharePoint list (BaseTemplate 100)." }
        $path = Get-ListPath $title
        $fields = @(if ($exists) { Get-SpCollection "$path/fields?`$select=InternalName,TypeAsString,Indexed&`$top=500" })
        if ($exists) {
            $titleField = @($fields | Where-Object { $_.InternalName -eq 'Title' -and $_.TypeAsString -eq 'Text' })
            if ($titleField.Count -ne 1) { throw "$title is missing the native Text Title field. Repair the list before provisioning." }
        }
        foreach ($field in $list.Fields) {
            $existing = @($fields | Where-Object { $_.InternalName -eq $field.Name })
            if ($existing.Count -gt 0 -and $existing[0].TypeAsString -ne $field.Type) {
                throw "$title.$($field.Name) has type $($existing[0].TypeAsString), expected $($field.Type). Resolve this schema conflict before provisioning."
            }
        }
        $plan += @{ Definition = $list; Title = $title; Path = $path; Exists = $exists; Fields = $fields }
    }

    foreach ($step in $plan) {
        $definition = $step.Definition
        if (-not $step.Exists) {
            $body = @{
                Title = $step.Title; BaseTemplate = 100; Hidden = $false
                Description = "Metrology-Confluence $($definition.Key)"
                EnableAttachments = ($definition.Key -eq 'Pages')
                EnableVersioning = ($definition.Key -eq 'Pages')
                ContentTypesEnabled = $false
            }
            $null = Invoke-SpRequest -Path '/_api/web/lists' -Method POST -Body $body
            Write-Host "Created $($step.Title)"
        }
        foreach ($field in $definition.Fields) {
            $existing = @($step.Fields | Where-Object { $_.InternalName -eq $field.Name })
            if ($existing.Count -eq 0) {
                $body = @{ parameters = @{ __metadata = @{ type = 'SP.XmlSchemaFieldCreationInformation' }; SchemaXml = (ConvertTo-FieldXml $field); Options = 8 } }
                $null = Invoke-SpRequest -Path "$($step.Path)/fields/createfieldasxml" -Method POST -VerboseJson -Body $body
                Write-Host "Added $($step.Title).$($field.Name)"
            } elseif ($field.Indexed -and -not $existing[0].Indexed) {
                $fieldName = [uri]::EscapeDataString($field.Name)
                $null = Invoke-SpRequest -Path "$($step.Path)/fields/getbyinternalnameortitle('$fieldName')" -Method POST -Body @{ Indexed = $true } -ExtraHeaders @{ 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
                Write-Host "Indexed $($step.Title).$($field.Name)"
            }
        }
        if ($definition.Key -eq 'Pages') {
            $null = Invoke-SpRequest -Path $step.Path -Method POST -Body @{ EnableAttachments = $true; EnableVersioning = $true } -ExtraHeaders @{ 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
        }
        $verified = @(Get-SpCollection "$($step.Path)/fields?`$select=InternalName,TypeAsString,Indexed&`$top=500")
        foreach ($field in $definition.Fields) {
            $match = @($verified | Where-Object { $_.InternalName -eq $field.Name -and $_.TypeAsString -eq $field.Type -and (-not $field.Indexed -or $_.Indexed) })
            if ($match.Count -ne 1) { throw "Could not verify $($step.Title).$($field.Name). The script is safe to rerun after correcting the reported failure." }
        }
        Write-Host "Verified $($step.Title)"
    }
    Write-Host 'Provisioning complete. Open the app on this SharePoint web and create your first space.'
} finally {
    $script:Token = $null
    $script:Digest = $null
}
